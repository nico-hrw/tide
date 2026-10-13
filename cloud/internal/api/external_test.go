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
