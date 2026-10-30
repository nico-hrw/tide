package store

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
)

func TestSQLiteStore_InitializationAndPragmas(t *testing.T) {
	tempDir := t.TempDir()
	store, err := NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	if store.DB == nil {
		t.Fatal("expected store.DB to be non-nil")
	}
	if store.reader == nil {
		t.Fatal("expected store.reader to be non-nil")
	}

	// Verify journal_mode is WAL on writer
	var journalModeWriter string
	if err := store.DB.QueryRow("PRAGMA journal_mode;").Scan(&journalModeWriter); err != nil {
		t.Fatalf("failed to query writer journal_mode: %v", err)
	}
	if strings.ToLower(journalModeWriter) != "wal" {
		t.Errorf("expected writer journal_mode to be 'wal', got %q", journalModeWriter)
	}

	// Verify journal_mode is WAL on reader
	var journalModeReader string
	if err := store.readDB().QueryRow("PRAGMA journal_mode;").Scan(&journalModeReader); err != nil {
		t.Fatalf("failed to query reader journal_mode: %v", err)
	}
	if strings.ToLower(journalModeReader) != "wal" {
		t.Errorf("expected reader journal_mode to be 'wal', got %q", journalModeReader)
	}

	// Verify query_only is 0 on writer
	var writerQueryOnly int
	if err := store.DB.QueryRow("PRAGMA query_only;").Scan(&writerQueryOnly); err != nil {
		t.Fatalf("failed to query writer query_only pragma: %v", err)
	}
	if writerQueryOnly != 0 {
		t.Errorf("expected writer query_only to be 0, got %d", writerQueryOnly)
	}

	// Verify query_only is 1 on reader
	var readerQueryOnly int
	if err := store.readDB().QueryRow("PRAGMA query_only;").Scan(&readerQueryOnly); err != nil {
		t.Fatalf("failed to query reader query_only pragma: %v", err)
	}
	if readerQueryOnly != 1 {
		t.Errorf("expected reader query_only to be 1, got %d", readerQueryOnly)
	}

	// Verify that writing on reader DB returns an error
	_, err = store.readDB().Exec("CREATE TABLE should_fail (id TEXT)")
	if err == nil {
		t.Errorf("expected write query on reader to fail, but got nil")
	}
}

func TestSQLiteStore_ConcurrentReadsAndWrites(t *testing.T) {
	tempDir := t.TempDir()
	store, err := NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Create test user
	testUser := &db.User{
		ID:              uuid.New().String(),
		PublicKey:       "pubkey-test",
		EncryptedVault:  []byte("vault"),
		EncryptedPepper: []byte("pepper"),
		CreatedAt:       time.Now(),
	}
	if err := store.CreateUser(ctx, testUser); err != nil {
		t.Fatalf("failed to create initial user: %v", err)
	}

	const (
		numWriters   = 8
		numReaders   = 16
		opsPerWorker = 30
	)

	var wg sync.WaitGroup
	errCh := make(chan error, numWriters*opsPerWorker+numReaders*opsPerWorker)

	var writesCompleted int64
	var readsCompleted int64

	// Start writer goroutines
	for w := 0; w < numWriters; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for i := 0; i < opsPerWorker; i++ {
				taskID := fmt.Sprintf("task-%d-%d", workerID, i)
				task := &db.Task{
					ID:             taskID,
					UserID:         testUser.ID,
					EncryptedVault: []byte(fmt.Sprintf("vault-data-%d-%d", workerID, i)),
					CreatedAt:      time.Now(),
					UpdatedAt:      time.Now(),
				}
				if err := store.CreateTask(ctx, task); err != nil {
					errCh <- fmt.Errorf("writer %d op %d CreateTask failed: %w", workerID, i, err)
					return
				}

				// Also perform an update
				task.EncryptedVault = []byte(fmt.Sprintf("updated-vault-%d-%d", workerID, i))
				task.UpdatedAt = time.Now()
				if err := store.UpdateTask(ctx, task); err != nil {
					errCh <- fmt.Errorf("writer %d op %d UpdateTask failed: %w", workerID, i, err)
					return
				}

				atomic.AddInt64(&writesCompleted, 1)
			}
		}(w)
	}

	// Start reader goroutines
	for r := 0; r < numReaders; r++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for i := 0; i < opsPerWorker; i++ {
				// Read user
				u, err := store.GetUser(ctx, testUser.ID)
				if err != nil {
					errCh <- fmt.Errorf("reader %d op %d GetUser failed: %w", workerID, i, err)
					return
				}
				if u == nil || u.ID != testUser.ID {
					errCh <- fmt.Errorf("reader %d op %d GetUser got unexpected user: %+v", workerID, i, u)
					return
				}

				// List tasks
				tasks, err := store.ListTasks(ctx, testUser.ID)
				if err != nil {
					errCh <- fmt.Errorf("reader %d op %d ListTasks failed: %w", workerID, i, err)
					return
				}
				_ = tasks

				atomic.AddInt64(&readsCompleted, 1)
				// brief sleep to interleave
				time.Sleep(time.Millisecond)
			}
		}(r)
	}

	wg.Wait()
	close(errCh)

	for err := range errCh {
		t.Fatalf("concurrency error encountered: %v", err)
	}

	expectedWrites := int64(numWriters * opsPerWorker)
	if writesCompleted != expectedWrites {
		t.Errorf("expected %d completed writes, got %d", expectedWrites, writesCompleted)
	}

	expectedReads := int64(numReaders * opsPerWorker)
	if readsCompleted != expectedReads {
		t.Errorf("expected %d completed reads, got %d", expectedReads, readsCompleted)
	}

	// Verify data consistency
	allTasks, err := store.ListTasks(ctx, testUser.ID)
	if err != nil {
		t.Fatalf("failed to list tasks after concurrency test: %v", err)
	}
	if int64(len(allTasks)) != expectedWrites {
		t.Errorf("expected %d tasks in store, got %d", expectedWrites, len(allTasks))
	}
}

func TestSQLiteStore_Close(t *testing.T) {
	tempDir := t.TempDir()
	store, err := NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	// Verify store is functioning
	if err := store.DB.Ping(); err != nil {
		t.Fatalf("writer ping failed before close: %v", err)
	}
	if err := store.reader.Ping(); err != nil {
		t.Fatalf("reader ping failed before close: %v", err)
	}

	// Close store
	if err := store.Close(); err != nil {
		t.Fatalf("store.Close() failed: %v", err)
	}

	// After Close, pings should fail
	if err := store.DB.Ping(); err == nil {
		t.Errorf("expected writer Ping to fail after Close, but it succeeded")
	}
	if err := store.reader.Ping(); err == nil {
		t.Errorf("expected reader Ping to fail after Close, but it succeeded")
	}
}

func TestUserCRUD(t *testing.T) {
	tempDir := t.TempDir()
	store, err := NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	emailHash := "email-blind-hash-test"
	pinHash := "initial-pin-hash"
	user := &db.User{
		ID:              uuid.New().String(),
		EmailHash:       &emailHash,
		EncryptedVault:  []byte("vault-bytes"),
		EncryptedPepper: []byte("pepper-bytes"),
		PublicKey:       "pubkey-test-user",
		Username:        "testuser",
		PinHash:         &pinHash,
		CreatedAt:       time.Now().UTC(),
	}

	// 1. Create user
	if err := store.CreateUser(ctx, user); err != nil {
		t.Fatalf("CreateUser failed: %v", err)
	}

	// 2. Retrieve by ID
	fetchedUser, err := store.GetUser(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUser failed: %v", err)
	}
	if fetchedUser.ID != user.ID {
		t.Errorf("expected user ID %s, got %s", user.ID, fetchedUser.ID)
	}
	if fetchedUser.Username != "testuser" {
		t.Errorf("expected username 'testuser', got %s", fetchedUser.Username)
	}
	if fetchedUser.PinHash == nil || *fetchedUser.PinHash != pinHash {
		t.Errorf("expected pin_hash %s, got %v", pinHash, fetchedUser.PinHash)
	}

	// 3. Retrieve by EmailHash
	fetchedByEmail, err := store.GetUserByEmailHash(ctx, emailHash)
	if err != nil {
		t.Fatalf("GetUserByEmailHash failed: %v", err)
	}
	if fetchedByEmail.ID != user.ID {
		t.Errorf("expected user ID %s, got %s", user.ID, fetchedByEmail.ID)
	}

	// 4. Update username
	newUsername := "updateduser"
	if err := store.UpdateUserUsername(ctx, user.ID, newUsername); err != nil {
		t.Fatalf("UpdateUserUsername failed: %v", err)
	}

	// 5. Update PIN
	newPinHash := "updated-pin-hash"
	if err := store.UpdateUserPin(ctx, user.ID, newPinHash); err != nil {
		t.Fatalf("UpdateUserPin failed: %v", err)
	}

	// Verify updates
	updatedUser, err := store.GetUser(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetUser after updates failed: %v", err)
	}
	if updatedUser.Username != newUsername {
		t.Errorf("expected updated username %s, got %s", newUsername, updatedUser.Username)
	}
	if updatedUser.PinHash == nil || *updatedUser.PinHash != newPinHash {
		t.Errorf("expected updated pin_hash %s, got %v", newPinHash, updatedUser.PinHash)
	}
}

func TestFileCRUD_And_IDOR(t *testing.T) {
	tempDir := t.TempDir()
	store, err := NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	// Create User A and User B
	userA := &db.User{
		ID:              uuid.New().String(),
		PublicKey:       "pubkey-user-a",
		EncryptedVault:  []byte("vault-a"),
		EncryptedPepper: []byte("pepper-a"),
		CreatedAt:       time.Now().UTC(),
	}
	if err := store.CreateUser(ctx, userA); err != nil {
		t.Fatalf("failed to create User A: %v", err)
	}

	userB := &db.User{
		ID:              uuid.New().String(),
		PublicKey:       "pubkey-user-b",
		EncryptedVault:  []byte("vault-b"),
		EncryptedPepper: []byte("pepper-b"),
		CreatedAt:       time.Now().UTC(),
	}
	if err := store.CreateUser(ctx, userB); err != nil {
		t.Fatalf("failed to create User B: %v", err)
	}

	// User A creates a file/note (Type: "note", OwnerID: User A)
	fileA := &db.File{
		ID:          uuid.New().String(),
		OwnerID:     userA.ID,
		ParentID:    nil,
		Type:        db.FileTypeNote,
		MIMEType:    nil,
		Size:        256,
		CreatedAt:   time.Now().UTC(),
		UpdatedAt:   time.Now().UTC(),
		Visibility:  "private",
		PublicMeta:  []byte("{}"),
		SecuredMeta: []byte("user-a-secret-note"),
		Metadata:    []byte("{}"),
		AccessKeys:  []byte("{}"),
	}
	if err := store.CreateFile(ctx, fileA); err != nil {
		t.Fatalf("CreateFile failed for User A: %v", err)
	}

	// Verify User A can fetch it with GetFile
	fetchedFile, err := store.GetFile(ctx, fileA.ID)
	if err != nil {
		t.Fatalf("User A GetFile failed: %v", err)
	}
	if fetchedFile.ID != fileA.ID || fetchedFile.OwnerID != userA.ID {
		t.Errorf("unexpected file returned: %+v", fetchedFile)
	}

	// Verify User A can fetch it with GetAccessibleFile
	accessibleFileA, err := store.GetAccessibleFile(ctx, fileA.ID, userA.ID)
	if err != nil {
		t.Fatalf("User A GetAccessibleFile failed: %v", err)
	}
	if accessibleFileA.ID != fileA.ID || accessibleFileA.OwnerID != userA.ID {
		t.Errorf("unexpected accessible file returned: %+v", accessibleFileA)
	}

	// IDOR Check: User B attempts GetAccessibleFile on fileA.ID -> must return error (file not found/accessible)
	_, err = store.GetAccessibleFile(ctx, fileA.ID, userB.ID)
	if err == nil {
		t.Fatalf("expected IDOR error when User B accesses User A's file, but got nil")
	}
	if !errors.Is(err, ErrNotFound) {
		t.Logf("User B GetAccessibleFile error (expected ErrNotFound): %v", err)
	}

	// Verify ListAccessibleFiles for User B does NOT return User A's file
	// Test both non-recursive and recursive listing
	filesForUserB, err := store.ListAccessibleFiles(ctx, userB.ID, nil, nil, false)
	if err != nil {
		t.Fatalf("ListAccessibleFiles non-recursive for User B failed: %v", err)
	}
	for _, f := range filesForUserB {
		if f.ID == fileA.ID {
			t.Fatalf("IDOR violation: User B found User A's file in non-recursive ListAccessibleFiles")
		}
	}

	filesForUserBRec, err := store.ListAccessibleFiles(ctx, userB.ID, nil, nil, true)
	if err != nil {
		t.Fatalf("ListAccessibleFiles recursive for User B failed: %v", err)
	}
	for _, f := range filesForUserBRec {
		if f.ID == fileA.ID {
			t.Fatalf("IDOR violation: User B found User A's file in recursive ListAccessibleFiles")
		}
	}
}

func TestTaskCRUD_And_IDOR(t *testing.T) {
	tempDir := t.TempDir()
	store, err := NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	// Create User A and User B
	userA := &db.User{
		ID:              uuid.New().String(),
		PublicKey:       "pubkey-user-a-task",
		EncryptedVault:  []byte("vault-a"),
		EncryptedPepper: []byte("pepper-a"),
		CreatedAt:       time.Now().UTC(),
	}
	if err := store.CreateUser(ctx, userA); err != nil {
		t.Fatalf("failed to create User A: %v", err)
	}

	userB := &db.User{
		ID:              uuid.New().String(),
		PublicKey:       "pubkey-user-b-task",
		EncryptedVault:  []byte("vault-b"),
		EncryptedPepper: []byte("pepper-b"),
		CreatedAt:       time.Now().UTC(),
	}
	if err := store.CreateUser(ctx, userB); err != nil {
		t.Fatalf("failed to create User B: %v", err)
	}

	// User A creates Task A (UserID: User A)
	taskA := &db.Task{
		ID:             uuid.New().String(),
		UserID:         userA.ID,
		EncryptedVault: []byte("user-a-secret-task"),
		CreatedAt:      time.Now().UTC(),
		UpdatedAt:      time.Now().UTC(),
	}
	if err := store.CreateTask(ctx, taskA); err != nil {
		t.Fatalf("CreateTask failed for User A: %v", err)
	}

	// Verify User A can fetch with GetTask(ctx, taskA.ID, userA.ID)
	fetchedTask, err := store.GetTask(ctx, taskA.ID, userA.ID)
	if err != nil {
		t.Fatalf("User A GetTask failed: %v", err)
	}
	if fetchedTask.ID != taskA.ID || fetchedTask.UserID != userA.ID {
		t.Fatalf("unexpected task fetched: %+v", fetchedTask)
	}
	if string(fetchedTask.EncryptedVault) != "user-a-secret-task" {
		t.Errorf("expected vault 'user-a-secret-task', got %s", string(fetchedTask.EncryptedVault))
	}

	// IDOR Check: User B attempts GetTask(ctx, taskA.ID, userB.ID) -> must return error
	_, err = store.GetTask(ctx, taskA.ID, userB.ID)
	if err == nil {
		t.Fatalf("expected IDOR error when User B calls GetTask on Task A, got nil")
	}

	// IDOR Check: User B attempts UpdateTask on Task A -> must return error or not modify
	hackedTask := &db.Task{
		ID:             taskA.ID,
		UserID:         userB.ID,
		EncryptedVault: []byte("hacked-task-vault"),
		UpdatedAt:      time.Now().UTC(),
	}
	err = store.UpdateTask(ctx, hackedTask)
	if err == nil {
		t.Fatalf("expected error when User B attempts UpdateTask on Task A, got nil")
	}

	// Verify User A's task was NOT modified
	checkTask, err := store.GetTask(ctx, taskA.ID, userA.ID)
	if err != nil {
		t.Fatalf("GetTask failed after update attempt: %v", err)
	}
	if string(checkTask.EncryptedVault) != "user-a-secret-task" {
		t.Fatalf("task was modified unexpectedly! got: %s", string(checkTask.EncryptedVault))
	}

	// IDOR Check: User B attempts DeleteTask(ctx, taskA.ID, userB.ID) -> must return error
	err = store.DeleteTask(ctx, taskA.ID, userB.ID)
	if err == nil {
		t.Fatalf("expected error when User B attempts DeleteTask on Task A, got nil")
	}

	// Verify User A's task still exists
	stillExists, err := store.GetTask(ctx, taskA.ID, userA.ID)
	if err != nil {
		t.Fatalf("GetTask failed after delete attempt: %v", err)
	}
	if stillExists == nil || stillExists.ID != taskA.ID {
		t.Fatalf("User A's task is missing after delete attempt")
	}
}

func TestBlobReferencesCount(t *testing.T) {
	tempDir := t.TempDir()
	store, err := NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	user := &db.User{
		ID:              uuid.New().String(),
		PublicKey:       "pubkey-blob-test",
		EncryptedVault:  []byte("vault"),
		EncryptedPepper: []byte("pepper"),
		CreatedAt:       time.Now().UTC(),
	}
	if err := store.CreateUser(ctx, user); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Build a file hierarchy:
	// rootFolder (folder)
	//   childFolder (folder)
	//     file1 (blob_path: "blob-1")
	//   file2 (blob_path: "blob-2")
	// file3 (root level, blob_path: "blob-1" - shared blob reference e.g. copied file)
	rootFolderID := uuid.New().String()
	rootFolder := &db.File{
		ID:         rootFolderID,
		OwnerID:    user.ID,
		ParentID:   nil,
		Type:       db.FileTypeFolder,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
		Visibility: "private",
	}
	if err := store.CreateFile(ctx, rootFolder); err != nil {
		t.Fatalf("failed to create rootFolder: %v", err)
	}

	childFolderID := uuid.New().String()
	childFolder := &db.File{
		ID:         childFolderID,
		OwnerID:    user.ID,
		ParentID:   &rootFolderID,
		Type:       db.FileTypeFolder,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
		Visibility: "private",
	}
	if err := store.CreateFile(ctx, childFolder); err != nil {
		t.Fatalf("failed to create childFolder: %v", err)
	}

	blob1 := "blob-path-1"
	blob2 := "blob-path-2"

	file1ID := uuid.New().String()
	file1 := &db.File{
		ID:         file1ID,
		OwnerID:    user.ID,
		ParentID:   &childFolderID,
		Type:       db.FileTypeFile,
		BlobPath:   &blob1,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
		Visibility: "private",
	}
	if err := store.CreateFile(ctx, file1); err != nil {
		t.Fatalf("failed to create file1: %v", err)
	}

	file2ID := uuid.New().String()
	file2 := &db.File{
		ID:         file2ID,
		OwnerID:    user.ID,
		ParentID:   &rootFolderID,
		Type:       db.FileTypeNote,
		BlobPath:   &blob2,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
		Visibility: "private",
	}
	if err := store.CreateFile(ctx, file2); err != nil {
		t.Fatalf("failed to create file2: %v", err)
	}

	// file3 is at root level and references blob1 as well (e.g., duplicated/copied file)
	file3ID := uuid.New().String()
	file3 := &db.File{
		ID:         file3ID,
		OwnerID:    user.ID,
		ParentID:   nil,
		Type:       db.FileTypeFile,
		BlobPath:   &blob1,
		CreatedAt:  time.Now().UTC(),
		UpdatedAt:  time.Now().UTC(),
		Visibility: "private",
	}
	if err := store.CreateFile(ctx, file3); err != nil {
		t.Fatalf("failed to create file3: %v", err)
	}

	// Test 1: GetFileBlobPaths for hierarchy
	rootBlobPaths, err := store.GetFileBlobPaths(ctx, rootFolderID)
	if err != nil {
		t.Fatalf("GetFileBlobPaths failed for rootFolder: %v", err)
	}
	sort.Strings(rootBlobPaths)
	expectedRootBlobs := []string{blob1, blob2}
	sort.Strings(expectedRootBlobs)
	if len(rootBlobPaths) != len(expectedRootBlobs) || rootBlobPaths[0] != expectedRootBlobs[0] || rootBlobPaths[1] != expectedRootBlobs[1] {
		t.Fatalf("expected root blobs %v, got %v", expectedRootBlobs, rootBlobPaths)
	}

	childBlobPaths, err := store.GetFileBlobPaths(ctx, childFolderID)
	if err != nil {
		t.Fatalf("GetFileBlobPaths failed for childFolder: %v", err)
	}
	if len(childBlobPaths) != 1 || childBlobPaths[0] != blob1 {
		t.Fatalf("expected child blobs [%s], got %v", blob1, childBlobPaths)
	}

	leafBlobPaths, err := store.GetFileBlobPaths(ctx, file2ID)
	if err != nil {
		t.Fatalf("GetFileBlobPaths failed for file2: %v", err)
	}
	if len(leafBlobPaths) != 1 || leafBlobPaths[0] != blob2 {
		t.Fatalf("expected leaf blobs [%s], got %v", blob2, leafBlobPaths)
	}

	emptyBlobPaths, err := store.GetFileBlobPaths(ctx, uuid.New().String())
	if err != nil {
		t.Fatalf("GetFileBlobPaths failed for non-existent file: %v", err)
	}
	if len(emptyBlobPaths) != 0 {
		t.Fatalf("expected 0 blobs for non-existent file, got %v", emptyBlobPaths)
	}

	// Test 2: CountBlobReferencesExcluding
	// Count blob1 with no exclusions -> should be 2 (file1 and file3)
	count, err := store.CountBlobReferencesExcluding(ctx, blob1, nil)
	if err != nil {
		t.Fatalf("CountBlobReferencesExcluding failed: %v", err)
	}
	if count != 2 {
		t.Errorf("expected 2 references for %s, got %d", blob1, count)
	}

	// Count blob1 excluding file1 -> should be 1 (file3 remains)
	count, err = store.CountBlobReferencesExcluding(ctx, blob1, []string{file1ID})
	if err != nil {
		t.Fatalf("CountBlobReferencesExcluding with exclusion failed: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 reference for %s excluding %s, got %d", blob1, file1ID, count)
	}

	// Count blob1 excluding both file1 and file3 -> should be 0
	count, err = store.CountBlobReferencesExcluding(ctx, blob1, []string{file1ID, file3ID})
	if err != nil {
		t.Fatalf("CountBlobReferencesExcluding with all exclusions failed: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 references for %s excluding both, got %d", blob1, count)
	}

	// Count blob2 with no exclusions -> should be 1 (file2)
	count, err = store.CountBlobReferencesExcluding(ctx, blob2, []string{})
	if err != nil {
		t.Fatalf("CountBlobReferencesExcluding failed for blob2: %v", err)
	}
	if count != 1 {
		t.Errorf("expected 1 reference for %s, got %d", blob2, count)
	}

	// Count non-existent blob -> should be 0
	count, err = store.CountBlobReferencesExcluding(ctx, "nonexistent-blob", nil)
	if err != nil {
		t.Fatalf("CountBlobReferencesExcluding failed for nonexistent blob: %v", err)
	}
	if count != 0 {
		t.Errorf("expected 0 references for nonexistent blob, got %d", count)
	}

	// Test 3: LocalBlobStore Put, GetSize, Exists, Delete
	blobStore := NewLocalBlobStore(tempDir)
	blobContent := "encrypted-binary-data-12345"
	if err := blobStore.Put(ctx, blob1, strings.NewReader(blobContent)); err != nil {
		t.Fatalf("blobStore.Put failed: %v", err)
	}
	if !blobStore.Exists(ctx, blob1) {
		t.Fatalf("expected blobStore.Exists to return true for %s", blob1)
	}
	size, err := blobStore.GetSize(ctx, blob1)
	if err != nil {
		t.Fatalf("blobStore.GetSize failed: %v", err)
	}
	if size != int64(len(blobContent)) {
		t.Errorf("expected size %d, got %d", len(blobContent), size)
	}
	if err := blobStore.Delete(ctx, blob1); err != nil {
		t.Fatalf("blobStore.Delete failed: %v", err)
	}
	if blobStore.Exists(ctx, blob1) {
		t.Fatalf("expected blobStore.Exists to return false after Delete")
	}
}

func TestCRDT_WAL_And_GetAccessibleFile(t *testing.T) {
	tempDir := t.TempDir()
	store, err := NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}
	defer store.Close()

	ctx := context.Background()

	// Helpers verification
	if !CanRead("owner") || !CanRead("share") || !CanRead("edit") || !CanRead("view") || CanRead("") || CanRead("none") {
		t.Errorf("CanRead helper failed")
	}
	if !CanWrite("owner") || !CanWrite("share") || !CanWrite("edit") || CanWrite("view") || CanWrite("") {
		t.Errorf("CanWrite helper failed")
	}
	if !CanAdmin("owner") || CanAdmin("edit") || CanAdmin("view") {
		t.Errorf("CanAdmin helper failed")
	}

	// Create users
	userA := &db.User{
		ID:              uuid.New().String(),
		EncryptedVault:  []byte("vaultA"),
		EncryptedPepper: []byte("pepperA"),
		PublicKey:       "pubkeyA",
		CreatedAt:       time.Now(),
	}
	userB := &db.User{
		ID:              uuid.New().String(),
		EncryptedVault:  []byte("vaultB"),
		EncryptedPepper: []byte("pepperB"),
		PublicKey:       "pubkeyB",
		CreatedAt:       time.Now(),
	}
	userC := &db.User{
		ID:              uuid.New().String(),
		EncryptedVault:  []byte("vaultC"),
		EncryptedPepper: []byte("pepperC"),
		PublicKey:       "pubkeyC",
		CreatedAt:       time.Now(),
	}
	_ = store.CreateUser(ctx, userA)
	_ = store.CreateUser(ctx, userB)
	_ = store.CreateUser(ctx, userC)

	// Create parent folder owned by userA
	folder := &db.File{
		ID:          uuid.New().String(),
		OwnerID:     userA.ID,
		Type:        db.FileTypeFolder,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Visibility:  "private",
		AccessKeys:  []byte("{}"),
	}
	if err := store.CreateFile(ctx, folder); err != nil {
		t.Fatalf("failed to create folder: %v", err)
	}

	// Create child note with parent_file_id
	childNote := &db.File{
		ID:           uuid.New().String(),
		OwnerID:      userA.ID,
		ParentFileID: &folder.ID,
		Type:         db.FileTypeNote,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
		Visibility:   "private",
		KeyEpoch:     1,
		AccessKeys:   []byte("{}"),
	}
	if err := store.CreateFile(ctx, childNote); err != nil {
		t.Fatalf("failed to create child note: %v", err)
	}

	// 1. UserA (owner) access check
	fileA, err := store.GetAccessibleFile(ctx, childNote.ID, userA.ID)
	if err != nil {
		t.Fatalf("owner access failed: %v", err)
	}
	if fileA.Permission != "owner" {
		t.Errorf("expected permission owner, got %s", fileA.Permission)
	}
	if fileA.ParentFileID == nil || *fileA.ParentFileID != folder.ID {
		t.Errorf("expected parent_file_id %s, got %v", folder.ID, fileA.ParentFileID)
	}

	// 2. UserB has no access -> ErrNotFound
	_, err = store.GetAccessibleFile(ctx, childNote.ID, userB.ID)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound for userB, got %v", err)
	}

	// 3. Pending share for UserB -> Still rejected!
	if err := store.ShareFileWithPermission(ctx, childNote.ID, userB.ID, []byte("meta"), "edit", false); err != nil {
		t.Fatalf("ShareFileWithPermission failed: %v", err)
	}
	_, _ = store.DB.ExecContext(ctx, "UPDATE file_shares SET status = 'pending' WHERE file_id = ? AND user_id = ?", childNote.ID, userB.ID)
	_, err = store.GetAccessibleFile(ctx, childNote.ID, userB.ID)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound for pending share, got %v", err)
	}

	// 4. Accept share for UserB -> Now edit access granted!
	if err := store.AcceptShare(ctx, childNote.ID, userB.ID); err != nil {
		t.Fatalf("AcceptShare failed: %v", err)
	}
	fileB, err := store.GetAccessibleFile(ctx, childNote.ID, userB.ID)
	if err != nil {
		t.Fatalf("accepted share access failed: %v", err)
	}
	if fileB.Permission != "edit" {
		t.Errorf("expected permission edit, got %s", fileB.Permission)
	}

	// 5. Parent folder share for UserC -> UserC gains access to child note!
	if err := store.ShareFileWithPermission(ctx, folder.ID, userC.ID, []byte("fmeta"), "view", false); err != nil {
		t.Fatalf("Share folder failed: %v", err)
	}
	if err := store.AcceptShare(ctx, folder.ID, userC.ID); err != nil {
		t.Fatalf("Accept folder share failed: %v", err)
	}
	fileC, err := store.GetAccessibleFile(ctx, childNote.ID, userC.ID)
	if err != nil {
		t.Fatalf("parent folder share access failed: %v", err)
	}
	if fileC.Permission != "view" {
		t.Errorf("expected permission view via parent, got %s", fileC.Permission)
	}

	// 6. Test WAL Appending
	seq1, err := store.AppendYjsWAL(ctx, childNote.ID, 1, []byte("iv1"), []byte("cipher1"))
	if err != nil {
		t.Fatalf("AppendYjsWAL seq1 failed: %v", err)
	}
	seq2, err := store.AppendYjsWAL(ctx, childNote.ID, 1, []byte("iv2"), []byte("cipher2"))
	if err != nil {
		t.Fatalf("AppendYjsWAL seq2 failed: %v", err)
	}
	if seq2 <= seq1 {
		t.Errorf("expected seq2 > seq1, got seq1=%d, seq2=%d", seq1, seq2)
	}

	// 7. Test GetCRDTState
	crdtState, err := store.GetCRDTState(ctx, childNote.ID, userA.ID)
	if err != nil {
		t.Fatalf("GetCRDTState failed: %v", err)
	}
	if crdtState.KeyEpoch != 1 {
		t.Errorf("expected KeyEpoch 1, got %d", crdtState.KeyEpoch)
	}
	if len(crdtState.WAL) != 2 {
		t.Fatalf("expected 2 WAL entries, got %d", len(crdtState.WAL))
	}
	if crdtState.WAL[0].SeqID != seq1 || crdtState.WAL[1].SeqID != seq2 {
		t.Errorf("unexpected WAL entries: %+v", crdtState.WAL)
	}

	// 8. Test CompactYjsWAL up to seq1
	if err := store.CompactYjsWAL(ctx, childNote.ID, seq1, 1, []byte("snap_iv"), []byte("snap_content")); err != nil {
		t.Fatalf("CompactYjsWAL failed: %v", err)
	}

	crdtStateAfterCompact, err := store.GetCRDTState(ctx, childNote.ID, userA.ID)
	if err != nil {
		t.Fatalf("GetCRDTState after compact failed: %v", err)
	}
	if crdtStateAfterCompact.SnapshotSeqID != seq1 {
		t.Errorf("expected SnapshotSeqID %d, got %d", seq1, crdtStateAfterCompact.SnapshotSeqID)
	}
	if len(crdtStateAfterCompact.WAL) != 1 || crdtStateAfterCompact.WAL[0].SeqID != seq2 {
		t.Errorf("expected only seq2 in WAL after compact, got %+v", crdtStateAfterCompact.WAL)
	}

	// 9. Test RevokeShareAndRotateKey
	err = store.RevokeShareAndRotateKey(ctx, childNote.ID, userB.ID, 2, `{"`+userA.ID+`":"wrappedKey"}`, "newSecuredMeta", []byte("snap_iv2"), []byte("snap_cipher2"))
	if err != nil {
		t.Fatalf("RevokeShareAndRotateKey failed: %v", err)
	}

	// UserB must no longer have access
	_, err = store.GetAccessibleFile(ctx, childNote.ID, userB.ID)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("expected ErrNotFound for revoked userB, got %v", err)
	}

	// File state should have epoch 2 and empty WAL
	updatedFile, err := store.GetAccessibleFile(ctx, childNote.ID, userA.ID)
	if err != nil {
		t.Fatalf("GetAccessibleFile after rotate failed: %v", err)
	}
	if updatedFile.KeyEpoch != 2 {
		t.Errorf("expected key epoch 2, got %d", updatedFile.KeyEpoch)
	}

	crdtStateRotated, err := store.GetCRDTState(ctx, childNote.ID, userA.ID)
	if err != nil {
		t.Fatalf("GetCRDTState after rotate failed: %v", err)
	}
	if crdtStateRotated.KeyEpoch != 2 {
		t.Errorf("expected crdt KeyEpoch 2, got %d", crdtStateRotated.KeyEpoch)
	}
	if len(crdtStateRotated.WAL) != 0 {
		t.Errorf("expected empty WAL after key rotate, got %d entries", len(crdtStateRotated.WAL))
	}
}
