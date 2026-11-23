package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/api"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type extTestEnv struct {
	t         *testing.T
	s         *store.SQLiteStore
	blobStore *store.LocalBlobStore
	router    chi.Router
	userID    string
}

func setupExtTestEnv(t *testing.T) *extTestEnv {
	t.Helper()
	s, tempDir := setupTestStore(t)
	t.Cleanup(func() { _ = os.RemoveAll(tempDir) })

	blobStore := store.NewLocalBlobStore(filepath.Join(tempDir, "blobs"))
	userID := "user-ext-full-" + uuid.NewString()
	err := s.CreateUser(context.Background(), &db.User{
		ID: userID, Username: "alice", EncryptedVault: []byte("vault"),
		EncryptedPepper: []byte("pepper"), PublicKey: "pubkey", CreatedAt: time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	r := chi.NewRouter()
	apiTokenHandler := api.NewAPITokenHandler(s)
	externalHandler := api.NewExternalHandler(s, blobStore)
	r.Route("/api-tokens", func(sub chi.Router) {
		sub.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				next.ServeHTTP(w, req.WithContext(context.WithValue(req.Context(), "user_id", userID)))
			})
		})
		sub.Post("/", apiTokenHandler.CreateToken)
		sub.Get("/scopes", apiTokenHandler.ListScopes)
	})
	r.Route("/external", externalHandler.RegisterRoutes)
	return &extTestEnv{t: t, s: s, blobStore: blobStore, router: r, userID: userID}
}

func (e *extTestEnv) newToken(scopes ...string) string {
	e.t.Helper()
	rec := e.do("POST", "/api-tokens", "", map[string]interface{}{"name": "tok", "scopes": scopes})
	mustStatus(e.t, rec, http.StatusCreated, "create token")
	return decodeJSON[api.CreateAPITokenResponse](e.t, rec).Token
}

func (e *extTestEnv) do(method, path, token string, body interface{}) *httptest.ResponseRecorder {
	e.t.Helper()
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			e.t.Fatalf("marshal body: %v", err)
		}
		rdr = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, rdr)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func decodeJSON[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var out T
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("decode JSON (%s): %v", rec.Body.String(), err)
	}
	return out
}

func mustStatus(t *testing.T, rec *httptest.ResponseRecorder, want int, label string) {
	t.Helper()
	if rec.Code != want {
		t.Fatalf("%s: expected status %d, got %d: %s", label, want, rec.Code, rec.Body.String())
	}
}

func TestExternalNotesCRDTResetAndMetadata(t *testing.T) {
	env := setupExtTestEnv(t)
	ctx := context.Background()
	tok := env.newToken("notes:write")

	rec := env.do("POST", "/external/notes", tok, map[string]interface{}{
		"title": "CRDT Note", "safe": "Work", "tag_ids": []string{"tag-a", "tag-b"},
		"icon": "rocket", "color": "#ff0000", "content": "Initial content",
	})
	mustStatus(t, rec, http.StatusCreated, "create note")
	created := decodeJSON[db.ExternalNote](t, rec)
	if created.Version != 2 || created.Safe != "Work" || created.Icon != "rocket" || created.Color != "#ff0000" {
		t.Fatalf("unexpected created note metadata/version: %+v", created)
	}
	if len(created.TagIDs) != 2 || created.TagIDs[0] != "tag-a" {
		t.Fatalf("expected tag_ids preserved, got %v", created.TagIDs)
	}

	dbFile, err := env.s.GetFile(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetFile failed: %v", err)
	}
	if !env.blobStore.Exists(ctx, created.ID) {
		t.Fatalf("expected blob to exist for note %s", created.ID)
	}
	if dbFile.Content != nil {
		t.Fatalf("expected file.Content == nil when BlobStore is active, got %d bytes", len(dbFile.Content))
	}

	seq1, err := env.s.AppendYjsWAL(ctx, created.ID, 1, []byte("iv1"), []byte("wal1"))
	if err != nil {
		t.Fatalf("AppendYjsWAL 1 failed: %v", err)
	}
	if err := env.s.CompactYjsWAL(ctx, created.ID, seq1, 1, []byte("snapiv"), []byte("snapcipher")); err != nil {
		t.Fatalf("CompactYjsWAL failed: %v", err)
	}
	if _, err := env.s.AppendYjsWAL(ctx, created.ID, 1, []byte("iv2"), []byte("wal2")); err != nil {
		t.Fatalf("AppendYjsWAL 2 failed: %v", err)
	}

	mustStatus(t, env.do("PATCH", "/external/notes/"+created.ID, tok, map[string]interface{}{
		"content": "Updated body",
	}), http.StatusOK, "patch content")
	mustStatus(t, env.do("PATCH", "/external/notes/"+created.ID, tok, map[string]interface{}{
		"append_content": "Appended line",
	}), http.StatusOK, "patch append_content")

	crdtState, err := env.s.GetCRDTState(ctx, created.ID, env.userID)
	if err != nil {
		t.Fatalf("GetCRDTState failed: %v", err)
	}
	if crdtState.SnapshotSeqID != 0 || crdtState.SnapshotIV != "" || crdtState.SnapshotCiphertext != "" || len(crdtState.WAL) != 0 {
		t.Fatalf("expected CRDT state reset, got %+v", crdtState)
	}

	getRec := env.do("GET", "/external/notes/"+created.ID, tok, nil)
	mustStatus(t, getRec, http.StatusOK, "get note after patch")
	fetched := decodeJSON[db.ExternalNote](t, getRec)
	if fetched.Content != "Updated body\nAppended line" || fetched.Version < 3 {
		t.Fatalf("unexpected fetched note: %+v", fetched)
	}

	mustStatus(t, env.do("DELETE", "/external/notes/"+created.ID, tok, nil), http.StatusOK, "soft delete note")
	mustStatus(t, env.do("GET", "/external/notes/"+created.ID, tok, nil), http.StatusNotFound, "get soft-deleted note")

	rec2 := env.do("POST", "/external/notes", tok, map[string]interface{}{
		"title": "Permanent Delete Note", "content": "Bye blob",
	})
	mustStatus(t, rec2, http.StatusCreated, "create second note")
	note2 := decodeJSON[db.ExternalNote](t, rec2)
	if !env.blobStore.Exists(ctx, note2.ID) {
		t.Fatalf("expected blob for second note")
	}
	mustStatus(t, env.do("DELETE", "/external/notes/"+note2.ID+"?permanent=true", tok, nil), http.StatusOK, "permanent delete note")
	mustStatus(t, env.do("GET", "/external/notes/"+note2.ID, tok, nil), http.StatusNotFound, "get permanently deleted note")
	if env.blobStore.Exists(ctx, note2.ID) {
		t.Fatalf("expected blob to be deleted on permanent delete")
	}
}

func TestExternalEventsCRUD(t *testing.T) {
	env := setupExtTestEnv(t)
	readTok := env.newToken("events:read")
	writeTok := env.newToken("events:write", "tags:write")

	mustStatus(t, env.do("POST", "/external/events", readTok, map[string]interface{}{"title": "Nope"}), http.StatusForbidden, "read token post event")
	mustStatus(t, env.do("PATCH", "/external/events/fake-id", readTok, map[string]interface{}{"title": "Nope"}), http.StatusForbidden, "read token patch event")
	mustStatus(t, env.do("DELETE", "/external/events/fake-id", readTok, nil), http.StatusForbidden, "read token delete event")

	tagRec := env.do("POST", "/external/tags", writeTok, map[string]interface{}{"title": "Calendar Group"})
	mustStatus(t, tagRec, http.StatusCreated, "create group tag")
	tagID := decodeJSON[struct{ Tag db.ExternalTag `json:"tag"` }](t, tagRec).Tag.ID

	start := time.Now().UTC().Add(2 * time.Hour).Truncate(time.Second)
	end := start.Add(time.Hour)
	createRec := env.do("POST", "/external/events", writeTok, map[string]interface{}{
		"title": "Architecture Review", "start": start.Format(time.RFC3339), "end": end.Format(time.RFC3339),
		"all_day": false, "color": "#10b981", "description": "Initial desc", "location": "Room 4",
		"group_ids": []string{tagID}, "recurrence_rule": "FREQ=WEEKLY", "is_important": true,
	})
	mustStatus(t, createRec, http.StatusCreated, "create event")
	ev := decodeJSON[struct{ Event db.ExternalEvent `json:"event"` }](t, createRec).Event
	if ev.Version != 2 || ev.ParentID == nil || *ev.ParentID != tagID || !ev.IsImportant || ev.RecurrenceRule != "FREQ=WEEKLY" {
		t.Fatalf("unexpected created event: %+v", ev)
	}

	qStart := start.Add(-time.Hour).Format(time.RFC3339)
	qEnd := end.Add(time.Hour).Format(time.RFC3339)
	listRec := env.do("GET", "/external/events?start="+qStart+"&end="+qEnd+"&tag_id="+tagID, readTok, nil)
	mustStatus(t, listRec, http.StatusOK, "list filtered events")
	listResp := decodeJSON[struct {
		Count  int                `json:"count"`
		Events []db.ExternalEvent `json:"events"`
	}](t, listRec)
	if listResp.Count != 1 || listResp.Events[0].ID != ev.ID {
		t.Fatalf("expected 1 filtered event, got %+v", listResp)
	}

	mustStatus(t, env.do("GET", "/external/events?limit=abc", readTok, nil), http.StatusBadRequest, "invalid limit")
	mustStatus(t, env.do("GET", "/external/events/"+ev.ID, readTok, nil), http.StatusOK, "get event")

	patchRec := env.do("PATCH", "/external/events/"+ev.ID, writeTok, map[string]interface{}{
		"title": "Updated Review", "description": "Updated desc",
	})
	mustStatus(t, patchRec, http.StatusOK, "patch event")
	updated := decodeJSON[struct{ Event db.ExternalEvent `json:"event"` }](t, patchRec).Event
	if updated.Title != "Updated Review" || updated.Description != "Updated desc" {
		t.Fatalf("unexpected patched event: %+v", updated)
	}

	mustStatus(t, env.do("DELETE", "/external/events/"+ev.ID, writeTok, nil), http.StatusOK, "delete event")
	mustStatus(t, env.do("GET", "/external/events/"+ev.ID, readTok, nil), http.StatusNotFound, "get deleted event")
}

func TestExternalFoldersAndTagsCRUD(t *testing.T) {
	env := setupExtTestEnv(t)
	fRead := env.newToken("folders:read")
	fWrite := env.newToken("folders:write")
	tRead := env.newToken("tags:read")
	tWrite := env.newToken("tags:write")

	mustStatus(t, env.do("POST", "/external/folders", fRead, map[string]interface{}{"title": "Blocked"}), http.StatusForbidden, "folders:read post")
	mustStatus(t, env.do("POST", "/external/tags", tRead, map[string]interface{}{"title": "Blocked"}), http.StatusForbidden, "tags:read post")

	pRec := env.do("POST", "/external/folders", fWrite, map[string]interface{}{"title": "Projects", "color": "#2563eb"})
	mustStatus(t, pRec, http.StatusCreated, "create parent folder")
	parent := decodeJSON[struct{ Folder db.ExternalFolder `json:"folder"` }](t, pRec).Folder

	cRec := env.do("POST", "/external/folders", fWrite, map[string]interface{}{"title": "Sub", "parent_id": parent.ID})
	mustStatus(t, cRec, http.StatusCreated, "create child folder")
	child := decodeJSON[struct{ Folder db.ExternalFolder `json:"folder"` }](t, cRec).Folder

	mustStatus(t, env.do("PATCH", "/external/folders/"+parent.ID, fWrite, map[string]interface{}{
		"parent_id": child.ID,
	}), http.StatusBadRequest, "folder cycle prevention")

	renameRec := env.do("PATCH", "/external/folders/"+child.ID, fWrite, map[string]interface{}{
		"title": "Sub Renamed", "parent_id": "__none__",
	})
	mustStatus(t, renameRec, http.StatusOK, "rename and move folder")
	renamed := decodeJSON[struct{ Folder db.ExternalFolder `json:"folder"` }](t, renameRec).Folder
	if renamed.Title != "Sub Renamed" || renamed.ParentID != nil {
		t.Fatalf("unexpected updated folder: %+v", renamed)
	}

	mustStatus(t, env.do("POST", "/external/tags", tWrite, map[string]interface{}{
		"title": "Bad Tag", "effect": "sparkles",
	}), http.StatusBadRequest, "invalid tag effect")

	tagCreate := env.do("POST", "/external/tags", tWrite, map[string]interface{}{
		"title": "Urgent", "color": "#ef4444", "effect": "stripes",
	})
	mustStatus(t, tagCreate, http.StatusCreated, "create valid tag")
	tag := decodeJSON[struct{ Tag db.ExternalTag `json:"tag"` }](t, tagCreate).Tag

	fList := decodeJSON[struct {
		Folders []db.ExternalFolder `json:"folders"`
	}](t, env.do("GET", "/external/folders", fRead, nil))
	for _, f := range fList.Folders {
		if f.ID == tag.ID {
			t.Fatalf("tag %s leaked into /external/folders", tag.ID)
		}
	}
	tList := decodeJSON[struct {
		Tags []db.ExternalTag `json:"tags"`
	}](t, env.do("GET", "/external/tags", tRead, nil))
	for _, tg := range tList.Tags {
		if tg.ID == parent.ID || tg.ID == child.ID {
			t.Fatalf("folder %s leaked into /external/tags", tg.ID)
		}
	}

	tagPatch := env.do("PATCH", "/external/tags/"+tag.ID, tWrite, map[string]interface{}{"title": "Very Urgent", "effect": "dots"})
	mustStatus(t, tagPatch, http.StatusOK, "patch tag")
	if got := decodeJSON[struct{ Tag db.ExternalTag `json:"tag"` }](t, tagPatch).Tag; got.Title != "Very Urgent" || got.Effect != "dots" {
		t.Fatalf("unexpected patched tag: %+v", got)
	}

	mustStatus(t, env.do("DELETE", "/external/tags/"+tag.ID, tWrite, nil), http.StatusOK, "delete tag")
	mustStatus(t, env.do("DELETE", "/external/folders/"+child.ID, fWrite, nil), http.StatusOK, "delete child folder")
	mustStatus(t, env.do("DELETE", "/external/folders/"+parent.ID, fWrite, nil), http.StatusOK, "delete parent folder")
}

func TestExternalWorkspacesCRUD(t *testing.T) {
	env := setupExtTestEnv(t)
	tok := env.newToken("workspaces:write", "notes:write")

	mustStatus(t, env.do("GET", "/external/workspaces", tok, nil), http.StatusOK, "list initial workspaces")
	mustStatus(t, env.do("POST", "/external/workspaces", tok, map[string]interface{}{"name": "Uni"}), http.StatusCreated, "create Uni")
	mustStatus(t, env.do("POST", "/external/workspaces", tok, map[string]interface{}{"name": "Uni"}), http.StatusConflict, "duplicate Uni")

	noteRec := env.do("POST", "/external/notes", tok, map[string]interface{}{
		"title": "Lecture 1", "safe": "Uni", "content": "Notes",
	})
	mustStatus(t, noteRec, http.StatusCreated, "create note in Uni")
	noteID := decodeJSON[db.ExternalNote](t, noteRec).ID

	wsList := decodeJSON[struct {
		Workspaces []db.ExternalWorkspace `json:"workspaces"`
	}](t, env.do("GET", "/external/workspaces", tok, nil))
	foundUni := false
	for _, ws := range wsList.Workspaces {
		if ws.Name == "Uni" && ws.FileCount >= 1 {
			foundUni = true
		}
	}
	if !foundUni {
		t.Fatalf("expected Uni with file_count >= 1, got %+v", wsList.Workspaces)
	}

	mustStatus(t, env.do("PATCH", "/external/workspaces/Uni", tok, map[string]interface{}{"new_name": "Studium"}), http.StatusOK, "rename Uni to Studium")
	renamedNote := decodeJSON[db.ExternalNote](t, env.do("GET", "/external/notes/"+noteID, tok, nil))
	if renamedNote.Safe != "Studium" {
		t.Fatalf("expected note safe propagated to 'Studium', got %q", renamedNote.Safe)
	}

	mustStatus(t, env.do("PUT", "/external/workspaces/active", tok, map[string]interface{}{
		"active_workspaces": []string{"main", "Studium"},
	}), http.StatusOK, "set active workspaces")
	mustStatus(t, env.do("PATCH", "/external/workspaces/main", tok, map[string]interface{}{"new_name": "Other"}), http.StatusBadRequest, "rename main")
	mustStatus(t, env.do("DELETE", "/external/workspaces/main", tok, nil), http.StatusBadRequest, "delete main")

	mustStatus(t, env.do("DELETE", "/external/workspaces/Studium", tok, nil), http.StatusOK, "delete Studium")
	reassigned := decodeJSON[db.ExternalNote](t, env.do("GET", "/external/notes/"+noteID, tok, nil))
	if reassigned.Safe != "main" {
		t.Fatalf("expected note reassigned to 'main', got %q", reassigned.Safe)
	}
}

func assertNoSensitiveKeys(t *testing.T, v interface{}, path string) {
	t.Helper()
	forbidden := []string{"pin", "email", "vault", "pepper", "public_key"}
	switch node := v.(type) {
	case map[string]interface{}:
		for k, child := range node {
			lk := strings.ToLower(k)
			for _, bad := range forbidden {
				if lk == bad || strings.Contains(lk, bad) {
					t.Fatalf("found forbidden sensitive key %q at %s", k, path+"."+k)
				}
			}
			assertNoSensitiveKeys(t, child, path+"."+k)
		}
	case []interface{}:
		for _, elem := range node {
			assertNoSensitiveKeys(t, elem, path+"[]")
		}
	}
}

func TestExternalSettingsAndSecurityBlocklist(t *testing.T) {
	env := setupExtTestEnv(t)
	tok := env.newToken("settings:write")

	getRec := env.do("GET", "/external/settings", tok, nil)
	mustStatus(t, getRec, http.StatusOK, "get default settings")
	assertNoSensitiveKeys(t, decodeJSON[map[string]interface{}](t, getRec), "root")
	defaults := decodeJSON[struct {
		Settings api.UserSettingsPayload `json:"settings"`
	}](t, getRec).Settings
	if defaults.Appearance.Theme != "system" || defaults.Calendar.WeekStartsOn != 1 || defaults.Notes.NoteLayout != "normal" {
		t.Fatalf("unexpected default settings: %+v", defaults)
	}

	patchRec := env.do("PATCH", "/external/settings", tok, map[string]interface{}{
		"profile":    map[string]interface{}{"username": "bob", "bio": "Tide user"},
		"appearance": map[string]interface{}{"theme": "dark", "language": "de"},
		"notes":      map[string]interface{}{"note_layout": "wide"},
		"calendar":   map[string]interface{}{"week_starts_on": 0},
		"extensions": map[string]interface{}{
			"enabled":      []string{"todos", "summary"},
			"smart_island": map[string]interface{}{"notification_duration_seconds": 8},
		},
	})
	mustStatus(t, patchRec, http.StatusOK, "patch settings")

	verifyRec := env.do("GET", "/external/settings", tok, nil)
	mustStatus(t, verifyRec, http.StatusOK, "get updated settings")
	got := decodeJSON[struct {
		Settings api.UserSettingsPayload `json:"settings"`
	}](t, verifyRec).Settings
	if got.Profile.Username != "bob" || got.Profile.Bio != "Tide user" ||
		got.Appearance.Theme != "dark" || got.Appearance.Language != "de" ||
		got.Notes.NoteLayout != "wide" || got.Calendar.WeekStartsOn != 0 ||
		len(got.Extensions.Enabled) != 2 || got.Extensions.SmartIsland.NotificationDurationSeconds != 8 {
		t.Fatalf("persisted settings mismatch: %+v", got)
	}

	blockedPayloads := []map[string]interface{}{
		{"pin": "12345"}, {"email": "x@y.de"}, {"profile": map[string]interface{}{"email": "x@y.de"}},
		{"new_pin": "54321"}, {"encrypted_vault": "abc"},
		{"extensions": map[string]interface{}{"mobile_connection": map[string]interface{}{"whisper_token": "secret"}}},
	}
	for i, payload := range blockedPayloads {
		mustStatus(t, env.do("PATCH", "/external/settings", tok, payload), http.StatusForbidden, "blocked payload #"+string(rune('0'+i)))
	}
	mustStatus(t, env.do("PATCH", "/external/settings", tok, map[string]interface{}{"appearance": map[string]interface{}{"theme": "neon"}}), http.StatusBadRequest, "invalid theme enum")
	mustStatus(t, env.do("PATCH", "/external/settings", tok, map[string]interface{}{"extensions": map[string]interface{}{"enabled": []string{"messenger"}}}), http.StatusBadRequest, "invalid extension enum")
}

func TestExternalTokenIntrospectionAndScopes(t *testing.T) {
	env := setupExtTestEnv(t)
	tok := env.newToken("todos:write", "notes:read")

	meRec := env.do("GET", "/external/me", tok, nil)
	mustStatus(t, meRec, http.StatusOK, "get /external/me")
	meMap := decodeJSON[map[string]interface{}](t, meRec)
	assertNoSensitiveKeys(t, meMap, "me")
	if meMap["user_id"] != env.userID || meMap["username"] != "alice" {
		t.Fatalf("unexpected /external/me identity: %+v", meMap)
	}
	scopesList, _ := meMap["scopes"].([]interface{})
	if len(scopesList) != 2 {
		t.Fatalf("expected 2 scopes in /external/me, got %v", meMap["scopes"])
	}

	scopesRec := env.do("GET", "/api-tokens/scopes", "", nil)
	mustStatus(t, scopesRec, http.StatusOK, "get /api-tokens/scopes")
	scopes := decodeJSON[[]struct {
		Key         string `json:"key"`
		Implemented bool   `json:"implemented"`
	}](t, scopesRec)
	required := map[string]bool{
		"events:write": false, "folders:read": false, "folders:write": false,
		"tags:read": false, "tags:write": false, "workspaces:read": false,
		"workspaces:write": false, "settings:read": false, "settings:write": false,
		"storage:expand": false, "*": false,
	}
	for _, sc := range scopes {
		if _, wanted := required[sc.Key]; wanted && sc.Implemented {
			required[sc.Key] = true
		}
	}
	for k, seen := range required {
		if !seen {
			t.Fatalf("missing or unimplemented scope %q in /api-tokens/scopes", k)
		}
	}

	customID := uuid.NewString()
	todoRec := env.do("POST", "/external/todos", tok, map[string]interface{}{
		"id": customID, "title": "Submit thesis", "folder": "University",
		"recurrence": "weekly", "show_in_calendar": true, "order": 7,
	})
	mustStatus(t, todoRec, http.StatusCreated, "create extended todo")
	createdTodo := decodeJSON[db.Todo](t, todoRec)
	if createdTodo.ID != customID || createdTodo.Folder != "University" || createdTodo.Recurrence != "weekly" || !createdTodo.ShowInCalendar || createdTodo.SortOrder != 7 {
		t.Fatalf("unexpected created todo: %+v", createdTodo)
	}

	listRec := env.do("GET", "/external/todos?folder=University", tok, nil)
	mustStatus(t, listRec, http.StatusOK, "list todos by folder")
	todos := decodeJSON[[]db.Todo](t, listRec)
	if len(todos) != 1 || todos[0].ID != customID {
		t.Fatalf("expected 1 filtered todo %s, got %+v", customID, todos)
	}
}
