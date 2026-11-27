package api

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
)

func makeTestJWT(t *testing.T, secret, userID string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("SignedString failed: %v", err)
	}
	return signed
}

func TestSecurityK02_EncryptedTodosStoreAndExternalAPIRedaction(t *testing.T) {
	s, _, aliceID, _ := setupPhase0StoreAndUser(t)
	ctx := context.Background()

	const jwtSecret = "0123456789abcdef0123456789abcdef"
	t.Setenv("JWT_SECRET", jwtSecret)
	jwtTok := makeTestJWT(t, jwtSecret, aliceID)
	patTok := insertPhase0Token(t, s, aliceID, "todos:read", "todos:create", "todos:edit", "todos:delete")

	todosH := NewTodosHandler(s)
	r := chi.NewRouter()
	r.Route("/api/v1/todos", todosH.RegisterRoutes)
	r.Route("/api/v1/external/todos", todosH.RegisterRoutes)

	// 1. Missing encrypted_payload for is_encrypted=true fails (400)
	badCreate := httptest.NewRequest(http.MethodPost, "/api/v1/todos", strings.NewReader(`{"is_encrypted":true}`))
	badCreate.Header.Set("Authorization", "Bearer "+jwtTok)
	recBad := httptest.NewRecorder()
	r.ServeHTTP(recBad, badCreate)
	if recBad.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when encrypted_payload missing, got %d: %s", recBad.Code, recBad.Body.String())
	}

	// 2. Create E2EE todo (no plaintext title required, plaintext columns must be blanked in SQLite even if supplied)
	encPayload := "eyJ2IjoyLCJ3ayI6IndyYXBwZWQiLCJjdCI6IntcImRhdGFcIjpcImFiY1wiLFwiaXZcIjpcInh5elwifSJ9"
	createBody, _ := json.Marshal(map[string]interface{}{
		"title":             "SHOULD_NOT_BE_STORED_IN_PLAINTEXT",
		"description":       "SECRET_DESC",
		"due_date":          "2026-12-01",
		"safe":              "PrivateSafe",
		"is_encrypted":      true,
		"encrypted_payload": encPayload,
	})
	reqCreate := httptest.NewRequest(http.MethodPost, "/api/v1/todos", bytes.NewReader(createBody))
	reqCreate.Header.Set("Authorization", "Bearer "+jwtTok)
	recCreate := httptest.NewRecorder()
	r.ServeHTTP(recCreate, reqCreate)
	if recCreate.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating encrypted todo, got %d: %s", recCreate.Code, recCreate.Body.String())
	}
	var created db.Todo
	if err := json.Unmarshal(recCreate.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created todo failed: %v", err)
	}
	if !created.IsEncrypted || created.EncryptedPayload != encPayload {
		t.Fatalf("expected is_encrypted=true and matching encrypted_payload, got %+v", created)
	}

	// Verify SQLite row has zero plaintext fields
	stored, err := s.GetTodoByID(ctx, aliceID, created.ID)
	if err != nil {
		t.Fatalf("GetTodoByID failed: %v", err)
	}
	if stored.Title != "" || stored.Description != "" || stored.DueDate != "" || stored.Safe != "" {
		t.Fatalf("plaintext columns leaked into SQLite for encrypted todo: %+v", stored)
	}

	// 3. JWT GET & PUT roundtrip
	reqUpdate := httptest.NewRequest(http.MethodPut, "/api/v1/todos/"+created.ID, strings.NewReader(`{"is_encrypted":true,"encrypted_payload":"updated-cipher-v2"}`))
	reqUpdate.Header.Set("Authorization", "Bearer "+jwtTok)
	recUpdate := httptest.NewRecorder()
	r.ServeHTTP(recUpdate, reqUpdate)
	if recUpdate.Code != http.StatusOK {
		t.Fatalf("expected 200 updating encrypted todo via JWT, got %d: %s", recUpdate.Code, recUpdate.Body.String())
	}
	storedAfter, _ := s.GetTodoByID(ctx, aliceID, created.ID)
	if storedAfter.EncryptedPayload != "updated-cipher-v2" {
		t.Fatalf("expected updated encrypted_payload, got %q", storedAfter.EncryptedPayload)
	}

	// 4. External API (PAT) GET list redacts encrypted_payload; GET single returns redacted stub
	reqPatList := httptest.NewRequest(http.MethodGet, "/api/v1/external/todos", nil)
	reqPatList.Header.Set("Authorization", "Bearer "+patTok)
	recPatList := httptest.NewRecorder()
	r.ServeHTTP(recPatList, reqPatList)
	if recPatList.Code != http.StatusOK {
		t.Fatalf("PAT GET list expected 200, got %d: %s", recPatList.Code, recPatList.Body.String())
	}
	if strings.Contains(recPatList.Body.String(), "updated-cipher-v2") {
		t.Fatalf("PAT GET list leaked encrypted_payload: %s", recPatList.Body.String())
	}

	reqPatGet := httptest.NewRequest(http.MethodGet, "/api/v1/external/todos/"+created.ID, nil)
	reqPatGet.Header.Set("Authorization", "Bearer "+patTok)
	recPatGet := httptest.NewRecorder()
	r.ServeHTTP(recPatGet, reqPatGet)
	if recPatGet.Code != http.StatusOK {
		t.Fatalf("PAT GET single expected 200, got %d: %s", recPatGet.Code, recPatGet.Body.String())
	}
	if !strings.Contains(recPatGet.Body.String(), `"encrypted":true`) || strings.Contains(recPatGet.Body.String(), "updated-cipher-v2") {
		t.Fatalf("PAT GET single unexpected body: %s", recPatGet.Body.String())
	}

	// 5. PAT PUT -> 400 (encrypted:true), PAT DELETE -> 403 (encrypted:true)
	reqPatPut := httptest.NewRequest(http.MethodPut, "/api/v1/external/todos/"+created.ID, strings.NewReader(`{"title":"Overwrite"}`))
	reqPatPut.Header.Set("Authorization", "Bearer "+patTok)
	recPatPut := httptest.NewRecorder()
	r.ServeHTTP(recPatPut, reqPatPut)
	if recPatPut.Code != http.StatusBadRequest || !strings.Contains(recPatPut.Body.String(), `"encrypted":true`) {
		t.Fatalf("PAT PUT on encrypted todo expected 400 encrypted:true, got %d: %s", recPatPut.Code, recPatPut.Body.String())
	}

	reqPatDel := httptest.NewRequest(http.MethodDelete, "/api/v1/external/todos/"+created.ID, nil)
	reqPatDel.Header.Set("Authorization", "Bearer "+patTok)
	recPatDel := httptest.NewRecorder()
	r.ServeHTTP(recPatDel, reqPatDel)
	if recPatDel.Code != http.StatusForbidden || !strings.Contains(recPatDel.Body.String(), `"encrypted":true`) {
		t.Fatalf("PAT DELETE on encrypted todo expected 403 encrypted:true, got %d: %s", recPatDel.Code, recPatDel.Body.String())
	}

	// 6. Unencrypted external todo CRUD still works via PAT
	reqExtCreate := httptest.NewRequest(http.MethodPost, "/api/v1/external/todos", strings.NewReader(`{"title":"External Open Todo","description":"AI-created"}`))
	reqExtCreate.Header.Set("Authorization", "Bearer "+patTok)
	recExtCreate := httptest.NewRecorder()
	r.ServeHTTP(recExtCreate, reqExtCreate)
	if recExtCreate.Code != http.StatusCreated {
		t.Fatalf("PAT POST unencrypted todo expected 201, got %d: %s", recExtCreate.Code, recExtCreate.Body.String())
	}
	var extTodo db.Todo
	_ = json.Unmarshal(recExtCreate.Body.Bytes(), &extTodo)
	if extTodo.IsEncrypted || extTodo.Title != "External Open Todo" {
		t.Fatalf("unexpected unencrypted external todo: %+v", extTodo)
	}
}

func TestSecurityK02_ExternalEventsRedactionAndNotesListEncryptedFlag(t *testing.T) {
	s, blobStore, aliceID, _ := setupPhase0StoreAndUser(t)
	ctx := context.Background()
	now := time.Now().UTC()

	patTok := insertPhase0Token(t, s, aliceID, "events:read", "events:write", "notes:read")
	extH := NewExternalHandler(s, blobStore).WithBroker(NewBroker())
	r := chi.NewRouter()
	r.Route("/api/v1/external", extH.RegisterRoutes)

	encEventID := uuid.NewString()
	openEventID := uuid.NewString()
	// Legacy/hybrid encrypted event that still has secured_meta AND lingering metadata fields
	if err := s.CreateFile(ctx, &db.File{
		ID: encEventID, OwnerID: aliceID, Type: db.FileTypeEvent, Visibility: "private",
		SecuredMeta: []byte("opaque-secured-envelope"),
		Metadata:    []byte(`{"title":"Secret Doctor Appointment","start":"2026-12-02T10:00:00Z","end":"2026-12-02T11:00:00Z","description":"Private medical details"}`),
		Version:     2, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("CreateFile encrypted event failed: %v", err)
	}
	// Explicitly unencrypted external event
	if err := s.CreateFile(ctx, &db.File{
		ID: openEventID, OwnerID: aliceID, Type: db.FileTypeEvent, Visibility: "private",
		Metadata:  []byte(`{"title":"Public Team Sync","start":"2026-12-02T14:00:00Z","end":"2026-12-02T15:00:00Z","description":"Agenda","unencrypted":true}`),
		PublicMeta: []byte(`{"title":"Public Team Sync"}`),
		Version:   2, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("CreateFile open event failed: %v", err)
	}

	// 1. GET /events/:id for encrypted event must redact sensitive fields
	reqGetEnc := httptest.NewRequest(http.MethodGet, "/api/v1/external/events/"+encEventID, nil)
	reqGetEnc.Header.Set("Authorization", "Bearer "+patTok)
	recGetEnc := httptest.NewRecorder()
	r.ServeHTTP(recGetEnc, reqGetEnc)
	if recGetEnc.Code != http.StatusOK {
		t.Fatalf("GET encrypted event expected 200, got %d: %s", recGetEnc.Code, recGetEnc.Body.String())
	}
	bodyStr := recGetEnc.Body.String()
	if strings.Contains(bodyStr, "Secret Doctor Appointment") || strings.Contains(bodyStr, "Private medical details") {
		t.Fatalf("GET encrypted event leaked sensitive plaintext: %s", bodyStr)
	}
	if !strings.Contains(bodyStr, `"encrypted":true`) || !strings.Contains(bodyStr, `"Encrypted Event"`) {
		t.Fatalf("expected encrypted stub in response, got %s", bodyStr)
	}

	// 2. GET /events (list) returns encrypted stub for encEvent and full details for openEvent
	reqList := httptest.NewRequest(http.MethodGet, "/api/v1/external/events", nil)
	reqList.Header.Set("Authorization", "Bearer "+patTok)
	recList := httptest.NewRecorder()
	r.ServeHTTP(recList, reqList)
	if recList.Code != http.StatusOK {
		t.Fatalf("GET events list expected 200, got %d", recList.Code)
	}
	if strings.Contains(recList.Body.String(), "Secret Doctor Appointment") || !strings.Contains(recList.Body.String(), "Public Team Sync") {
		t.Fatalf("unexpected events list output: %s", recList.Body.String())
	}

	// 3. ListNotesForExternalAPI must mark encrypted=true whenever secured_meta is non-empty even if unencrypted=true
	lockedNoteID := uuid.NewString()
	unlockedNoteID := uuid.NewString()
	if err := s.CreateFile(ctx, &db.File{
		ID: lockedNoteID, OwnerID: aliceID, Type: db.FileTypeNote, Visibility: "private",
		SecuredMeta: []byte("cipher-title"),
		Metadata:    []byte(`{"title":"Spoofed","unencrypted":true}`),
		Version:     2, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("CreateFile lockedNote failed: %v", err)
	}
	if err := s.CreateFile(ctx, &db.File{
		ID: unlockedNoteID, OwnerID: aliceID, Type: db.FileTypeNote, Visibility: "private",
		Metadata: []byte(`{"title":"Unlocked Via API Copy","unencrypted":true,"has_custom_password":false}`),
		Version:  2, CreatedAt: now, UpdatedAt: now,
	}); err != nil {
		t.Fatalf("CreateFile unlockedNote failed: %v", err)
	}

	noteItems, err := s.ListNotesForExternalAPI(ctx, aliceID, "", 50)
	if err != nil {
		t.Fatalf("ListNotesForExternalAPI failed: %v", err)
	}
	byID := map[string]*db.ExternalNoteListItem{}
	for _, n := range noteItems {
		byID[n.ID] = n
	}
	if byID[lockedNoteID] == nil || !byID[lockedNoteID].Encrypted {
		t.Fatalf("expected note with secured_meta to have Encrypted=true, got %+v", byID[lockedNoteID])
	}
	if byID[unlockedNoteID] == nil || byID[unlockedNoteID].Encrypted {
		t.Fatalf("expected opted-in unencrypted note without secured_meta to have Encrypted=false, got %+v", byID[unlockedNoteID])
	}
}
