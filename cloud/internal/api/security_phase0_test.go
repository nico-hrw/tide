package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

func setupPhase0StoreAndUser(t *testing.T) (*store.SQLiteStore, store.BlobStore, string, string) {
	t.Helper()
	s, err := store.NewSQLiteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewSQLiteStore failed: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	blobStore := store.NewLocalBlobStore(t.TempDir())

	aliceID := "alice-" + uuid.NewString()
	bobID := "bob-" + uuid.NewString()
	for _, u := range []*db.User{
		{
			ID:              aliceID,
			Username:        "alice",
			PublicKey:       "alice-pub",
			EncryptedVault:  []byte(`{"salt":"c2FsdA==","iv":"aXY=","ciphertext":"Y2lwaGVy"}`),
			EncryptedPepper: []byte("secret-pepper-bytes-alice"),
			CreatedAt:       time.Now().UTC(),
		},
		{
			ID:              bobID,
			Username:        "bob",
			PublicKey:       "bob-pub",
			EncryptedVault:  []byte(`{"salt":"Ym9ic2FsdA==","iv":"Ym9iaXY=","ciphertext":"Ym9iY2lwaGVy"}`),
			EncryptedPepper: []byte("secret-pepper-bytes-bob"),
			CreatedAt:       time.Now().UTC(),
		},
	} {
		if err := s.CreateUser(context.Background(), u); err != nil {
			t.Fatalf("CreateUser(%s) failed: %v", u.ID, err)
		}
	}
	return s, blobStore, aliceID, bobID
}

func insertPhase0Token(t *testing.T, s *store.SQLiteStore, userID string, scopes ...string) string {
	t.Helper()
	raw := "tide_pat_test_" + uuid.NewString()
	sum := sha256.Sum256([]byte(raw))
	tok := &db.APIToken{
		ID:          uuid.NewString(),
		UserID:      userID,
		Name:        "phase0-test",
		TokenHash:   hex.EncodeToString(sum[:]),
		TokenPrefix: "tide_pat_test",
		Scopes:      scopes,
		CreatedAt:   time.Now().UTC(),
	}
	if err := s.CreateAPIToken(context.Background(), tok); err != nil {
		t.Fatalf("CreateAPIToken failed: %v", err)
	}
	return raw
}

func TestSecurityPhase0_K01_ConversationsNeverLeakVaultOrPepper(t *testing.T) {
	s, _, aliceID, bobID := setupPhase0StoreAndUser(t)
	ctx := context.Background()

	if err := s.CreateMessage(ctx, &store.Message{
		ID:          uuid.NewString(),
		SenderID:    aliceID,
		RecipientID: bobID,
		Content:     "hi bob",
		Status:      "sent",
		CreatedAt:   time.Now().UTC(),
	}); err != nil {
		t.Fatalf("CreateMessage failed: %v", err)
	}

	mh := &MessageHandler{Store: s}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/messages/conversations", nil)
	req = req.WithContext(context.WithValue(req.Context(), "user_id", aliceID))
	rec := httptest.NewRecorder()
	mh.ListConversations(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", rec.Code, rec.Body.String())
	}
	body := rec.Body.String()
	for _, forbidden := range []string{"encrypted_vault", "encrypted_pepper", "secret-pepper-bytes-bob", "Ym9ic2FsdA=="} {
		if strings.Contains(body, forbidden) {
			t.Fatalf("conversation response leaked %q: %s", forbidden, body)
		}
	}

	var users []map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &users); err != nil {
		t.Fatalf("decode conversations: %v", err)
	}
	if len(users) != 1 || users[0]["id"] != bobID || users[0]["username"] != "bob" {
		t.Fatalf("unexpected conversation partner payload: %+v", users)
	}
}

func TestSecurityPhase0_H01_StoreFileAuthorizationAndRedaction(t *testing.T) {
	s, _, aliceID, bobID := setupPhase0StoreAndUser(t)
	ctx := context.Background()
	now := time.Now().UTC()

	alicePublicID := "alice-pub-file"
	alicePendingID := "alice-pending-file"
	aliceFolderID := "alice-folder"
	bobChildInAliceFolder := "bob-child-in-alice-folder"

	for _, f := range []*db.File{
		{
			ID:          alicePublicID,
			OwnerID:     aliceID,
			Type:        db.FileTypeNote,
			Visibility:  "public",
			Metadata:    []byte(`{"title":"Public Note"}`),
			PublicMeta:  []byte(`{"title":"Public Note"}`),
			SecuredMeta: []byte("owner-secret-meta"),
			AccessKeys:  json.RawMessage(`{"` + aliceID + `":{"wrapped_key":"owner-dek"}}`),
			Version:     2,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:          alicePendingID,
			OwnerID:     aliceID,
			Type:        db.FileTypeNote,
			Visibility:  "private",
			Metadata:    []byte(`{"title":"Pending Note"}`),
			PublicMeta:  []byte(`{"title":"Pending Note"}`),
			SecuredMeta: []byte("owner-pending-secret"),
			AccessKeys:  json.RawMessage(`{"` + aliceID + `":{"wrapped_key":"owner-dek"},"` + bobID + `":{"wrapped_key":"bob-dek"}}`),
			Version:     2,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
		{
			ID:         aliceFolderID,
			OwnerID:    aliceID,
			Type:       db.FileTypeFolder,
			Visibility: "private",
			Metadata:   []byte(`{"title":"Alice Folder"}`),
			Version:    2,
			CreatedAt:  now,
			UpdatedAt:  now,
		},
		{
			ID:          bobChildInAliceFolder,
			OwnerID:     bobID,
			ParentID:    &aliceFolderID,
			Type:        db.FileTypeNote,
			Visibility:  "public",
			Metadata:    []byte(`{"title":"Bob Public Child"}`),
			SecuredMeta: []byte("bob-secret-meta"),
			AccessKeys:  json.RawMessage(`{"` + bobID + `":{"wrapped_key":"bob-only-dek"}}`),
			Version:     2,
			CreatedAt:   now,
			UpdatedAt:   now,
		},
	} {
		if err := s.CreateFile(ctx, f); err != nil {
			t.Fatalf("CreateFile(%s) failed: %v", f.ID, err)
		}
	}

	if err := s.ShareFileWithPermission(ctx, alicePendingID, bobID, []byte("invite-meta-for-bob"), "edit", false); err != nil {
		t.Fatalf("ShareFileWithPermission failed: %v", err)
	}
	if _, err := s.DB.ExecContext(ctx, `UPDATE file_shares SET status = 'pending' WHERE file_id = ? AND user_id = ?`, alicePendingID, bobID); err != nil {
		t.Fatalf("failed to mark share pending: %v", err)
	}

	// 1. Recursive listing for Bob must NOT include Alice's unrelated public file,
	//    and pending share must NOT expose Alice's access_keys.
	recFiles, err := s.ListAccessibleFiles(ctx, bobID, nil, nil, true)
	if err != nil {
		t.Fatalf("ListAccessibleFiles recursive failed: %v", err)
	}
	for _, f := range recFiles {
		if f.ID == alicePublicID {
			t.Fatalf("recursive ListAccessibleFiles leaked Alice's unrelated public file to Bob")
		}
		if f.ID == alicePendingID {
			if f.ShareStatus != "pending" {
				t.Fatalf("expected share_status 'pending', got %q", f.ShareStatus)
			}
			if string(f.AccessKeys) != "{}" {
				t.Fatalf("expected redacted access_keys '{}' for pending share, got %s", f.AccessKeys)
			}
			if string(f.SecuredMeta) != "invite-meta-for-bob" {
				t.Fatalf("expected invite secured_meta, got %q", string(f.SecuredMeta))
			}
		}
	}

	// 2. Folder listing under Alice's folder for Alice must redact Bob's public child's secured_meta/access_keys and not label it 'owner'.
	folderChildren, err := s.ListAccessibleFiles(ctx, aliceID, &aliceFolderID, nil, false)
	if err != nil {
		t.Fatalf("ListAccessibleFiles parentID failed: %v", err)
	}
	for _, f := range folderChildren {
		if f.ID == bobChildInAliceFolder {
			t.Fatalf("parentID ListAccessibleFiles should not include unshared public child owned by Bob")
		}
	}

	// 3. ListPublicFiles for Bob viewing Alice must redact Alice's secured_meta and access_keys.
	pubFiles, err := s.ListPublicFiles(ctx, aliceID, bobID)
	if err != nil {
		t.Fatalf("ListPublicFiles failed: %v", err)
	}
	if len(pubFiles) != 1 || pubFiles[0].ID != alicePublicID {
		t.Fatalf("expected 1 public file, got %d", len(pubFiles))
	}
	if len(pubFiles[0].SecuredMeta) != 0 {
		t.Fatalf("expected redacted secured_meta on public file for non-collaborator, got %q", string(pubFiles[0].SecuredMeta))
	}
	if string(pubFiles[0].AccessKeys) != "{}" {
		t.Fatalf("expected redacted access_keys on public file for non-collaborator, got %s", pubFiles[0].AccessKeys)
	}

	// 4. GetAccessibleFile on public file for Bob also redacts secured_meta and access_keys.
	gotPub, err := s.GetAccessibleFile(ctx, alicePublicID, bobID)
	if err != nil {
		t.Fatalf("GetAccessibleFile public failed: %v", err)
	}
	if len(gotPub.SecuredMeta) != 0 || string(gotPub.AccessKeys) != "{}" {
		t.Fatalf("expected redacted keys/meta in GetAccessibleFile for non-collaborator, got meta=%q keys=%s", gotPub.SecuredMeta, gotPub.AccessKeys)
	}
}

func TestSecurityPhase0_K04_CollaboratorUpdateRestrictionsAndExternalE2EE(t *testing.T) {
	s, blobStore, aliceID, bobID := setupPhase0StoreAndUser(t)
	ctx := context.Background()
	now := time.Now().UTC()

	noteID := uuid.NewString()
	bobFolderID := uuid.NewString()
	for _, f := range []*db.File{
		{
			ID:         noteID,
			OwnerID:    aliceID,
			Type:       db.FileTypeNote,
			Visibility: "private",
			Metadata:   []byte(`{"title":"Encrypted Note","unencrypted":false}`),
			Version:    1,
			CreatedAt:  now,
			UpdatedAt:  now,
		},
		{
			ID:         bobFolderID,
			OwnerID:    bobID,
			Type:       db.FileTypeFolder,
			Visibility: "private",
			Metadata:   []byte(`{"title":"Bob Folder"}`),
			Version:    1,
			CreatedAt:  now,
			UpdatedAt:  now,
		},
	} {
		if err := s.CreateFile(ctx, f); err != nil {
			t.Fatalf("CreateFile(%s) failed: %v", f.ID, err)
		}
	}
	if err := s.ShareFileWithPermission(ctx, noteID, bobID, []byte("bob-meta"), "edit", false); err != nil {
		t.Fatalf("ShareFileWithPermission failed: %v", err)
	}
	if err := s.AcceptShare(ctx, noteID, bobID); err != nil {
		t.Fatalf("AcceptShare failed: %v", err)
	}

	fh := NewFileHandler(s, blobStore, nil)
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(context.WithValue(req.Context(), "user_id", bobID)))
		})
	})
	r.Put("/files/{fileID}", fh.UpdateFile)

	doPut := func(payload map[string]interface{}) *httptest.ResponseRecorder {
		b, _ := json.Marshal(payload)
		req := httptest.NewRequest(http.MethodPut, "/files/"+noteID, bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}

	// Collaborator cannot reparent owner's file
	if rec := doPut(map[string]interface{}{"parent_id": bobFolderID}); rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for collaborator reparent, got %d: %s", rec.Code, rec.Body.String())
	}
	// Collaborator cannot toggle unencrypted=true (which used to reset CRDT state)
	if rec := doPut(map[string]interface{}{"metadata": map[string]interface{}{"unencrypted": true}}); rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for collaborator unencrypted toggle, got %d: %s", rec.Code, rec.Body.String())
	}
	// Collaborator cannot soft-delete via metadata.deleted_at
	if rec := doPut(map[string]interface{}{"metadata": map[string]interface{}{"deleted_at": "2026-11-27T00:00:00Z"}}); rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for collaborator deleted_at injection, got %d: %s", rec.Code, rec.Body.String())
	}

	// External API must refuse overwriting E2EE events, folders, and tags (SecuredMeta present)
	e2eeEventID := uuid.NewString()
	e2eeFolderID := uuid.NewString()
	e2eeTagID := uuid.NewString()
	for _, f := range []*db.File{
		{ID: e2eeEventID, OwnerID: aliceID, Type: db.FileTypeEvent, SecuredMeta: []byte("enc-ev"), Metadata: []byte(`{"start":"2026-11-27T10:00:00Z"}`), Version: 2, CreatedAt: now, UpdatedAt: now},
		{ID: e2eeFolderID, OwnerID: aliceID, Type: db.FileTypeFolder, SecuredMeta: []byte("enc-dir"), Metadata: []byte(`{"safe":"main"}`), Version: 2, CreatedAt: now, UpdatedAt: now},
		{ID: e2eeTagID, OwnerID: aliceID, Type: db.FileTypeFolder, SecuredMeta: []byte("enc-tag"), Metadata: []byte(`{"isGroup":true}`), PublicMeta: []byte(`{"isGroup":true}`), Version: 2, CreatedAt: now, UpdatedAt: now},
	} {
		if err := s.CreateFile(ctx, f); err != nil {
			t.Fatalf("CreateFile(%s) failed: %v", f.ID, err)
		}
	}

	extTok := insertPhase0Token(t, s, aliceID, "*")
	extRouter := chi.NewRouter()
	NewExternalHandler(s, blobStore).RegisterRoutes(extRouter)

	for _, tc := range []struct {
		path string
		body string
	}{
		{"/events/" + e2eeEventID, `{"title":"Plaintext Overwrite"}`},
		{"/folders/" + e2eeFolderID, `{"title":"Plaintext Folder"}`},
		{"/tags/" + e2eeTagID, `{"title":"Plaintext Tag"}`},
	} {
		req := httptest.NewRequest(http.MethodPatch, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Authorization", "Bearer "+extTok)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		extRouter.ServeHTTP(rec, req)
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for E2EE overwrite on %s, got %d: %s", tc.path, rec.Code, rec.Body.String())
		}
	}
}

func TestSecurityPhase0_H03_ExternalScopeBypassesBlocked(t *testing.T) {
	s, blobStore, aliceID, _ := setupPhase0StoreAndUser(t)
	ctx := context.Background()
	now := time.Now().UTC()

	// Create a folder & a note in primary safe "Personal" linked to "Work"
	folderID := uuid.NewString()
	personalNoteID := uuid.NewString()
	for _, f := range []*db.File{
		{ID: folderID, OwnerID: aliceID, Type: db.FileTypeFolder, Metadata: []byte(`{"title":"F","safe":"Personal"}`), Version: 2, CreatedAt: now, UpdatedAt: now},
		{ID: personalNoteID, OwnerID: aliceID, Type: db.FileTypeNote, Metadata: []byte(`{"title":"P","safe":"Personal","linkedSafes":["Work"],"unencrypted":true}`), PublicMeta: []byte(`{"title":"P"}`), Version: 2, CreatedAt: now, UpdatedAt: now},
	} {
		if err := s.CreateFile(ctx, f); err != nil {
			t.Fatalf("CreateFile(%s) failed: %v", f.ID, err)
		}
	}

	extRouter := chi.NewRouter()
	NewExternalHandler(s, blobStore).RegisterRoutes(extRouter)

	// 1. Empty safe: / folder: scope tokens must NOT pass tokenMatchesScope
	emptySafeTok := insertPhase0Token(t, s, aliceID, "safe:")
	emptyFolderTok := insertPhase0Token(t, s, aliceID, "folder:   ")
	for _, tok := range []string{emptySafeTok, emptyFolderTok} {
		req := httptest.NewRequest(http.MethodGet, "/notes", nil)
		req.Header.Set("Authorization", "Bearer "+tok)
		rec := httptest.NewRecorder()
		extRouter.ServeHTTP(rec, req)
		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for malformed empty scope token, got %d: %s", rec.Code, rec.Body.String())
		}
	}

	// 2. folder:<id> token cannot list all workspaces
	folderTok := insertPhase0Token(t, s, aliceID, "folder:"+folderID)
	wsReq := httptest.NewRequest(http.MethodGet, "/workspaces", nil)
	wsReq.Header.Set("Authorization", "Bearer "+folderTok)
	wsRec := httptest.NewRecorder()
	extRouter.ServeHTTP(wsRec, wsReq)
	if wsRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for folder-scoped token on GET /workspaces, got %d: %s", wsRec.Code, wsRec.Body.String())
	}

	// 3. safe:Work + workspaces:write cannot create or delete an unrelated workspace ("Personal")
	workWsTok := insertPhase0Token(t, s, aliceID, "workspaces:write", "safe:Work")
	cReq := httptest.NewRequest(http.MethodPost, "/workspaces", strings.NewReader(`{"name":"Personal"}`))
	cReq.Header.Set("Authorization", "Bearer "+workWsTok)
	cReq.Header.Set("Content-Type", "application/json")
	cRec := httptest.NewRecorder()
	extRouter.ServeHTTP(cRec, cReq)
	if cRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 creating out-of-scope workspace, got %d: %s", cRec.Code, cRec.Body.String())
	}

	// 4. safe:Work + notes:write can READ linked note, but CANNOT update or delete note whose primary safe is Personal
	workNoteTok := insertPhase0Token(t, s, aliceID, "notes:write", "safe:Work")
	gReq := httptest.NewRequest(http.MethodGet, "/notes/"+personalNoteID, nil)
	gReq.Header.Set("Authorization", "Bearer "+workNoteTok)
	gRec := httptest.NewRecorder()
	extRouter.ServeHTTP(gRec, gReq)
	if gRec.Code != http.StatusOK {
		t.Fatalf("expected 200 reading linked note, got %d: %s", gRec.Code, gRec.Body.String())
	}

	pReq := httptest.NewRequest(http.MethodPatch, "/notes/"+personalNoteID, strings.NewReader(`{"title":"Hijacked"}`))
	pReq.Header.Set("Authorization", "Bearer "+workNoteTok)
	pReq.Header.Set("Content-Type", "application/json")
	pRec := httptest.NewRecorder()
	extRouter.ServeHTTP(pRec, pReq)
	if pRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 mutating note via linked_safes only, got %d: %s", pRec.Code, pRec.Body.String())
	}
}

func TestSecurityPhase0_H04_QuicknotesDownloadSniffingAndTitleRedaction(t *testing.T) {
	h, s, hub := setupTestQuicknoteHandler(t)
	r := chi.NewRouter()
	h.RegisterRoutes(r)

	// Create owner user and approval-gated quicknote with secret title
	ownerID := "qn-owner-" + uuid.NewString()
	secretTitle := "Confidential Project Roadmap"
	slug := "phase0-secret-qn"
	if _, err := s.GetOrCreateQuicknote(context.Background(), slug, secretTitle); err != nil {
		t.Fatalf("GetOrCreateQuicknote failed: %v", err)
	}
	if _, err := s.SetQuicknoteAccessMode(context.Background(), slug, ownerID, "approval_required"); err != nil {
		t.Fatalf("SetQuicknoteAccessMode failed: %v", err)
	}

	// Guest 403 must NOT contain the quicknote title
	req403 := httptest.NewRequest(http.MethodGet, "/"+slug, nil)
	rec403 := httptest.NewRecorder()
	r.ServeHTTP(rec403, req403)
	if rec403.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec403.Code)
	}
	if strings.Contains(rec403.Body.String(), secretTitle) || strings.Contains(rec403.Body.String(), `"title"`) {
		t.Fatalf("403 response leaked title: %s", rec403.Body.String())
	}

	// Switch back to open to upload test attachments, then verify download headers
	if _, err := s.SetQuicknoteAccessMode(context.Background(), slug, ownerID, "open"); err != nil {
		t.Fatalf("SetQuicknoteAccessMode(open) failed: %v", err)
	}

	uploadPart := func(filename, declaredMIME string, data []byte) string {
		var buf bytes.Buffer
		mw := multipart.NewWriter(&buf)
		hdr := make(textproto.MIMEHeader)
		hdr.Set("Content-Disposition", `form-data; name="file"; filename="`+filename+`"`)
		hdr.Set("Content-Type", declaredMIME)
		part, err := mw.CreatePart(hdr)
		if err != nil {
			t.Fatalf("CreatePart failed: %v", err)
		}
		_, _ = part.Write(data)
		_ = mw.Close()

		req := httptest.NewRequest(http.MethodPost, "/"+slug+"/files", &buf)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != http.StatusCreated {
			t.Fatalf("upload %s failed (%d): %s", filename, rec.Code, rec.Body.String())
		}
		var qf store.QuicknoteFile
		if err := json.Unmarshal(rec.Body.Bytes(), &qf); err != nil {
			t.Fatalf("decode upload resp: %v", err)
		}
		return qf.ID
	}

	// 1. Disguised HTML/SVG claiming image/png or image/svg+xml must download as application/octet-stream + attachment
	svgID := uploadPart("evil.svg", "image/svg+xml", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>`))
	htmlDisguisedAsPngID := uploadPart("fake.png", "image/png", []byte(`<html><body>hello</body></html>`))
	// 2. Real PNG bytes with image/png must serve inline as image/png
	realPNG := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52}
	pngID := uploadPart("ok.png", "image/png", realPNG)

	checkDownload := func(id, wantCT, wantDisp string) {
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/"+slug+"/files/"+id, nil))
		if rec.Code != http.StatusOK {
			t.Fatalf("download %s failed: %d", id, rec.Code)
		}
		if got := rec.Header().Get("Content-Type"); got != wantCT {
			t.Fatalf("download %s Content-Type: got %q, want %q", id, got, wantCT)
		}
		if got := rec.Header().Get("Content-Disposition"); !strings.HasPrefix(got, wantDisp) {
			t.Fatalf("download %s Content-Disposition: got %q, want prefix %q", id, got, wantDisp)
		}
		if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
			t.Fatalf("expected nosniff, got %q", got)
		}
	}

	checkDownload(svgID, "application/octet-stream", "attachment")
	checkDownload(htmlDisguisedAsPngID, "application/octet-stream", "attachment")
	checkDownload(pngID, "image/png", "inline")

	// 3. Hub.EvictRoomClientsExcept removes unapproved/anonymous WS clients
	roomID := "quicknote:" + slug
	anonClient := &Client{hub: hub, fileID: roomID, userID: "", send: make(chan []byte, 4), done: make(chan struct{})}
	ownerClient := &Client{hub: hub, fileID: roomID, userID: ownerID, send: make(chan []byte, 4), done: make(chan struct{})}
	hub.addClient(anonClient)
	hub.addClient(ownerClient)

	hub.EvictRoomClientsExcept(roomID, map[string]bool{ownerID: true})

	hub.mu.RLock()
	_, anonStillIn := hub.rooms[roomID][anonClient]
	_, ownerStillIn := hub.rooms[roomID][ownerClient]
	hub.mu.RUnlock()
	if anonStillIn {
		t.Fatalf("expected anonymous client to be evicted")
	}
	if !ownerStillIn {
		t.Fatalf("expected owner client to remain in room")
	}
}
