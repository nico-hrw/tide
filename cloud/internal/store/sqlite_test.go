package store

import (
	"context"
	"fmt"
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
		numWriters = 8
		numReaders = 16
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
