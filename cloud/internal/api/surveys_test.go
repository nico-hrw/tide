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
)

func TestSurveysAPI_FullLifecycle(t *testing.T) {
	s, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	userID := "user-surveys-test"
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

	token := createTestToken(t, s, userID, []string{"*"})

	r := chi.NewRouter()
	surveysHandler := api.NewSurveysHandler(s)
	r.Route("/api/v1/surveys", surveysHandler.RegisterRoutes)

	// 1. Initial GET /responses -> empty array
	req := httptest.NewRequest(http.MethodGet, "/api/v1/surveys/responses", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on empty list, got %d: %s", w.Code, w.Body.String())
	}
	var listResp []db.SurveyResponse
	if err := json.Unmarshal(w.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("failed to decode empty responses list: %v", err)
	}
	if len(listResp) != 0 {
		t.Fatalf("expected 0 responses, got %d", len(listResp))
	}

	// 2. POST /responses -> creates a response
	createPayload := map[string]interface{}{
		"survey_id": "mood_tracker",
		"data":      `{"mood":"good","score":3,"label":"Good"}`,
	}
	payloadBytes, _ := json.Marshal(createPayload)
	req = httptest.NewRequest(http.MethodPost, "/api/v1/surveys/responses", bytes.NewReader(payloadBytes))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created on post response, got %d: %s", w.Code, w.Body.String())
	}
	var created db.SurveyResponse
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("failed to decode created response: %v", err)
	}
	if created.ID == "" {
		t.Fatal("expected non-empty ID generated")
	}
	if created.SurveyID != "mood_tracker" {
		t.Fatalf("expected survey_id mood_tracker, got %s", created.SurveyID)
	}
	if created.UserID != userID {
		t.Fatalf("expected user_id %s, got %s", userID, created.UserID)
	}

	// 3. GET /responses?survey_id=mood_tracker -> returns 1 response
	req = httptest.NewRequest(http.MethodGet, "/api/v1/surveys/responses?survey_id=mood_tracker", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK on get list, got %d", w.Code)
	}
	listResp = nil
	if err := json.Unmarshal(w.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("failed to decode list: %v", err)
	}
	if len(listResp) != 1 {
		t.Fatalf("expected 1 response, got %d", len(listResp))
	}
	if listResp[0].ID != created.ID {
		t.Fatalf("expected ID %s, got %s", created.ID, listResp[0].ID)
	}

	// 4. DELETE /responses/{id} -> 204 No Content
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/surveys/responses/"+created.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content on delete, got %d: %s", w.Code, w.Body.String())
	}

	// 5. DELETE again -> 404 Not Found
	req = httptest.NewRequest(http.MethodDelete, "/api/v1/surveys/responses/"+created.ID, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found on delete nonexistent, got %d", w.Code)
	}

	// 6. Unauthorized request -> 401 Unauthorized
	req = httptest.NewRequest(http.MethodGet, "/api/v1/surveys/responses", nil)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", w.Code)
	}
}
