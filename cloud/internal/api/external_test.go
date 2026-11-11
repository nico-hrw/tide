package api_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/api"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

func setupTestStore(t *testing.T) (*store.SQLiteStore, string) {
	tempDir, err := os.MkdirTemp("", "tide-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	s, err := store.NewSQLiteStore(tempDir)
	if err != nil {
		t.Fatalf("failed to init sqlite store: %v", err)
	}

	return s, tempDir
}

func TestAPITokensAndExternalEvents(t *testing.T) {
	s, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	userID := "user-123"
	// Create user in DB
	err := s.CreateUser(context.Background(), &db.User{
		ID:              userID,
		EncryptedVault:  []byte("vault"),
		EncryptedPepper: []byte("pepper"),
		PublicKey:       "pubkey",
		CreatedAt:       time.Now(),
	})
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	// Create router with handlers
	r := chi.NewRouter()
	apiTokenHandler := api.NewAPITokenHandler(s)
	externalHandler := api.NewExternalHandler(s)

	// Mock auth context for token management
	r.Route("/api-tokens", func(sub chi.Router) {
		sub.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				ctx := context.WithValue(req.Context(), "user_id", userID)
				next.ServeHTTP(w, req.WithContext(ctx))
			})
		})
		sub.Get("/", apiTokenHandler.ListTokens)
		sub.Post("/", apiTokenHandler.CreateToken)
		sub.Delete("/{tokenID}", apiTokenHandler.DeleteToken)
	})

	r.Route("/external", externalHandler.RegisterRoutes)

	// 1. Create a token with events:read scope
	createBody, _ := json.Marshal(map[string]interface{}{
		"name":            "Home Assistant",
		"scopes":          []string{"events:read"},
		"expires_in_days": 30,
	})
	req := httptest.NewRequest("POST", "/api-tokens", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", rec.Code, rec.Body.String())
	}

	var createdToken api.CreateAPITokenResponse
	if err := json.NewDecoder(rec.Body).Decode(&createdToken); err != nil {
		t.Fatalf("failed to decode created token: %v", err)
	}
	if createdToken.Token == "" {
		t.Fatalf("expected plaintext token in response")
	}

	// 2. Insert test events for the user
	eventID1 := "event-1"
	eventID2 := "event-2"
	now := time.Now().UTC()
	start1 := now.Add(1 * time.Hour).Format(time.RFC3339)
	end1 := now.Add(2 * time.Hour).Format(time.RFC3339)
	start2 := now.Add(24 * time.Hour).Format(time.RFC3339)
	end2 := now.Add(25 * time.Hour).Format(time.RFC3339)

	meta1, _ := json.Marshal(map[string]interface{}{
		"title":       "Team Standup",
		"start":       start1,
		"end":         end1,
		"allDay":      false,
		"description": "Daily sync meeting",
		"location":    "Zoom",
	})
	meta2, _ := json.Marshal(map[string]interface{}{
		"title":       "Dentist Appointment",
		"start":       start2,
		"end":         end2,
		"allDay":      false,
		"description": "Checkup",
	})

	_ = s.CreateFile(context.Background(), &db.File{
		ID:        eventID1,
		OwnerID:   userID,
		Type:      db.FileTypeEvent,
		CreatedAt: now,
		UpdatedAt: now,
		Metadata:  meta1,
	})
	_ = s.CreateFile(context.Background(), &db.File{
		ID:        eventID2,
		OwnerID:   userID,
		Type:      db.FileTypeEvent,
		CreatedAt: now,
		UpdatedAt: now,
		Metadata:  meta2,
	})

	// 3. Query /external/events without token -> should fail 401
	unauthReq := httptest.NewRequest("GET", "/external/events", nil)
	unauthRec := httptest.NewRecorder()
	r.ServeHTTP(unauthRec, unauthReq)
	if unauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", unauthRec.Code)
	}

	// 4. Query /external/events with token -> should succeed 200
	authReq := httptest.NewRequest("GET", "/external/events", nil)
	authReq.Header.Set("Authorization", "Bearer "+createdToken.Token)
	authRec := httptest.NewRecorder()
	r.ServeHTTP(authRec, authReq)
	if authRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", authRec.Code, authRec.Body.String())
	}

	var eventsResp struct {
		Count  int                `json:"count"`
		Events []*db.ExternalEvent `json:"events"`
	}
	if err := json.NewDecoder(authRec.Body).Decode(&eventsResp); err != nil {
		t.Fatalf("failed to decode events response: %v", err)
	}
	if eventsResp.Count != 2 {
		t.Fatalf("expected 2 events, got %d", eventsResp.Count)
	}
	if eventsResp.Events[0].Title != "Team Standup" {
		t.Errorf("expected first event title 'Team Standup', got '%s'", eventsResp.Events[0].Title)
	}

	// 5. Query /external/events/{id}
	singleReq := httptest.NewRequest("GET", "/external/events/"+eventID1, nil)
	singleReq.Header.Set("Authorization", "Bearer "+createdToken.Token)
	singleRec := httptest.NewRecorder()
	r.ServeHTTP(singleRec, singleReq)
	if singleRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for single event, got %d", singleRec.Code)
	}

	// 6. Test search filter
	searchReq := httptest.NewRequest("GET", "/external/events?q=Dentist", nil)
	searchReq.Header.Set("Authorization", "Bearer "+createdToken.Token)
	searchRec := httptest.NewRecorder()
	r.ServeHTTP(searchRec, searchReq)
	var searchResp struct {
		Count  int                `json:"count"`
		Events []*db.ExternalEvent `json:"events"`
	}
	_ = json.NewDecoder(searchRec.Body).Decode(&searchResp)
	if searchResp.Count != 1 || searchResp.Events[0].Title != "Dentist Appointment" {
		t.Fatalf("search filter failed: got %d events", searchResp.Count)
	}

	// 7. Test token without events:read (e.g. only notes:read)
	noScopeBody, _ := json.Marshal(map[string]interface{}{
		"name":   "Notes Only Token",
		"scopes": []string{"notes:read"},
	})
	noScopeReq := httptest.NewRequest("POST", "/api-tokens", bytes.NewReader(noScopeBody))
	noScopeReq.Header.Set("Content-Type", "application/json")
	noScopeRec := httptest.NewRecorder()
	r.ServeHTTP(noScopeRec, noScopeReq)
	var notesOnlyToken api.CreateAPITokenResponse
	_ = json.NewDecoder(noScopeRec.Body).Decode(&notesOnlyToken)

	eventsReqWithNotesToken := httptest.NewRequest("GET", "/external/events", nil)
	eventsReqWithNotesToken.Header.Set("Authorization", "Bearer "+notesOnlyToken.Token)
	eventsRecWithNotesToken := httptest.NewRecorder()
	r.ServeHTTP(eventsRecWithNotesToken, eventsReqWithNotesToken)
	if eventsRecWithNotesToken.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for token lacking events:read, got %d", eventsRecWithNotesToken.Code)
	}

	// 8. Delete token
	delReq := httptest.NewRequest("DELETE", "/api-tokens/"+createdToken.ID, nil)
	delRec := httptest.NewRecorder()
	r.ServeHTTP(delRec, delReq)
	if delRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on token delete, got %d", delRec.Code)
	}

	// 9. Query with deleted token -> 401
	deletedReq := httptest.NewRequest("GET", "/external/events", nil)
	deletedReq.Header.Set("Authorization", "Bearer "+createdToken.Token)
	deletedRec := httptest.NewRecorder()
	r.ServeHTTP(deletedRec, deletedReq)
	if deletedRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized for deleted token, got %d", deletedRec.Code)
	}
}

func TestExternalNotesCRUD(t *testing.T) {
	s, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	userID := "user-note-tester"
	err := s.CreateUser(context.Background(), &db.User{
		ID:              userID,
		EncryptedVault:  []byte("vault"),
		EncryptedPepper: []byte("pepper"),
		PublicKey:       "pubkey",
		CreatedAt:       time.Now(),
	})
	if err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	r := chi.NewRouter()
	apiTokenHandler := api.NewAPITokenHandler(s)
	externalHandler := api.NewExternalHandler(s)

	r.Route("/api-tokens", func(sub chi.Router) {
		sub.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				ctx := context.WithValue(req.Context(), "user_id", userID)
				next.ServeHTTP(w, req.WithContext(ctx))
			})
		})
		sub.Post("/", apiTokenHandler.CreateToken)
	})
	r.Route("/external", externalHandler.RegisterRoutes)

	// 1. Create a token with notes:write and notes:read
	createBody, _ := json.Marshal(map[string]interface{}{
		"name":   "Notes Manager",
		"scopes": []string{"notes:read", "notes:write"},
	})
	req := httptest.NewRequest("POST", "/api-tokens", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("failed to create token: %d %s", rec.Code, rec.Body.String())
	}
	var fullToken api.CreateAPITokenResponse
	_ = json.NewDecoder(rec.Body).Decode(&fullToken)

	// Create a read-only token
	roBody, _ := json.Marshal(map[string]interface{}{
		"name":   "Notes Reader",
		"scopes": []string{"notes:read"},
	})
	roReq := httptest.NewRequest("POST", "/api-tokens", bytes.NewReader(roBody))
	roReq.Header.Set("Content-Type", "application/json")
	roRec := httptest.NewRecorder()
	r.ServeHTTP(roRec, roReq)
	var readOnlyToken api.CreateAPITokenResponse
	_ = json.NewDecoder(roRec.Body).Decode(&readOnlyToken)

	// 2. Read-only token tries to POST /external/notes -> 403 Forbidden
	failPostReq := httptest.NewRequest("POST", "/external/notes", bytes.NewReader([]byte(`{"title":"Forbidden Note","content":"test"}`)))
	failPostReq.Header.Set("Authorization", "Bearer "+readOnlyToken.Token)
	failPostReq.Header.Set("Content-Type", "application/json")
	failPostRec := httptest.NewRecorder()
	r.ServeHTTP(failPostRec, failPostReq)
	if failPostRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for read-only token on POST, got %d", failPostRec.Code)
	}

	// 3. Full token creates a note: POST /external/notes
	postBody, _ := json.Marshal(map[string]interface{}{
		"title":   "Meeting Notes",
		"content": "Discussed roadmap and external API design.",
	})
	postReq := httptest.NewRequest("POST", "/external/notes", bytes.NewReader(postBody))
	postReq.Header.Set("Authorization", "Bearer "+fullToken.Token)
	postReq.Header.Set("Content-Type", "application/json")
	postRec := httptest.NewRecorder()
	r.ServeHTTP(postRec, postReq)
	if postRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on POST /external/notes, got %d: %s", postRec.Code, postRec.Body.String())
	}
	var createdNoteResp struct {
		ID      string `json:"id"`
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	_ = json.NewDecoder(postRec.Body).Decode(&createdNoteResp)
	if createdNoteResp.ID == "" || createdNoteResp.Title != "Meeting Notes" || createdNoteResp.Content != "Discussed roadmap and external API design." {
		t.Fatalf("unexpected created note response: %+v", createdNoteResp)
	}
	noteID := createdNoteResp.ID

	// 4. List notes: GET /external/notes
	listReq := httptest.NewRequest("GET", "/external/notes", nil)
	listReq.Header.Set("Authorization", "Bearer "+readOnlyToken.Token)
	listRec := httptest.NewRecorder()
	r.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on GET /external/notes, got %d", listRec.Code)
	}
	var listResp struct {
		Count int                       `json:"count"`
		Notes []*db.ExternalNoteListItem `json:"notes"`
	}
	_ = json.NewDecoder(listRec.Body).Decode(&listResp)
	if listResp.Count != 1 || listResp.Notes[0].ID != noteID || listResp.Notes[0].Title != "Meeting Notes" {
		t.Fatalf("unexpected list response: %+v", listResp)
	}

	// 5. Get note: GET /external/notes/{id}
	getReq := httptest.NewRequest("GET", "/external/notes/"+noteID, nil)
	getReq.Header.Set("Authorization", "Bearer "+readOnlyToken.Token)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on GET /external/notes/{id}, got %d", getRec.Code)
	}
	var getResp struct {
		ID      string `json:"id"`
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	_ = json.NewDecoder(getRec.Body).Decode(&getResp)
	if getResp.Title != "Meeting Notes" || getResp.Content != "Discussed roadmap and external API design." {
		t.Fatalf("unexpected get response: %+v", getResp)
	}

	// 6. Update note: PUT /external/notes/{id}
	putBody, _ := json.Marshal(map[string]interface{}{
		"title":   "Updated Meeting Notes",
		"content": "Action items assigned.",
	})
	putReq := httptest.NewRequest("PUT", "/external/notes/"+noteID, bytes.NewReader(putBody))
	putReq.Header.Set("Authorization", "Bearer "+fullToken.Token)
	putReq.Header.Set("Content-Type", "application/json")
	putRec := httptest.NewRecorder()
	r.ServeHTTP(putRec, putReq)
	if putRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on PUT /external/notes/{id}, got %d: %s", putRec.Code, putRec.Body.String())
	}
	var putResp struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	_ = json.NewDecoder(putRec.Body).Decode(&putResp)
	if putResp.Title != "Updated Meeting Notes" || putResp.Content != "Action items assigned." {
		t.Fatalf("unexpected update response: %+v", putResp)
	}

	// 7. Delete note: DELETE /external/notes/{id}
	delReq := httptest.NewRequest("DELETE", "/external/notes/"+noteID, nil)
	delReq.Header.Set("Authorization", "Bearer "+fullToken.Token)
	delRec := httptest.NewRecorder()
	r.ServeHTTP(delRec, delReq)
	if delRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on DELETE /external/notes/{id}, got %d: %s", delRec.Code, delRec.Body.String())
	}

	// 8. Verify note is gone: GET /external/notes/{id} -> 404
	afterDelReq := httptest.NewRequest("GET", "/external/notes/"+noteID, nil)
	afterDelReq.Header.Set("Authorization", "Bearer "+fullToken.Token)
	afterDelRec := httptest.NewRecorder()
	r.ServeHTTP(afterDelRec, afterDelReq)
	if afterDelRec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found after deletion, got %d", afterDelRec.Code)
	}
}
