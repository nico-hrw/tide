package api_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/api"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

func createTestToken(t *testing.T, s *store.SQLiteStore, userID string, scopes []string) string {
	rawToken := "tide_pat_" + uuid.New().String() + uuid.New().String()
	hashBytes := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(hashBytes[:])

	tokenModel := &db.APIToken{
		ID:          uuid.New().String(),
		UserID:      userID,
		Name:        "Test Token",
		TokenHash:   tokenHash,
		TokenPrefix: rawToken[:16],
		Scopes:      scopes,
		CreatedAt:   time.Now(),
	}

	if err := s.CreateAPIToken(context.Background(), tokenModel); err != nil {
		t.Fatalf("failed to create test token: %v", err)
	}

	return rawToken
}

func TestTodosAPI_FullLifecycle(t *testing.T) {
	s, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	userID := "user-todos-test"
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
	todosHandler := api.NewTodosHandler(s)
	r.Route("/api/v1/todos", todosHandler.RegisterRoutes)

	// Tokens with different scopes
	readToken := createTestToken(t, s, userID, []string{"todos:read"})
	createToken := createTestToken(t, s, userID, []string{"todos:create"})
	writeToken := createTestToken(t, s, userID, []string{"todos:write"})
	unauthorizedToken := createTestToken(t, s, userID, []string{"events:read"})

	// 1. Unauthorized access (no token)
	req := httptest.NewRequest("GET", "/api/v1/todos", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized for missing token, got %d", w.Code)
	}

	// 2. Forbidden access (wrong scope)
	req = httptest.NewRequest("GET", "/api/v1/todos", nil)
	req.Header.Set("Authorization", "Bearer "+unauthorizedToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for wrong scope, got %d", w.Code)
	}

	// 3. Create Todo using createToken
	createBody := map[string]interface{}{
		"title":          "Implement Todos API",
		"description":    "Write REST handlers and store layer",
		"priority":       "high",
		"due_date":       "2029-11-10",
		"scheduled_date": "2029-11-05",
		"tags":           []string{"backend", "go"},
		"color":          "#3b82f6",
	}
	bodyBytes, _ := json.Marshal(createBody)
	req = httptest.NewRequest("POST", "/api/v1/todos", bytes.NewReader(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+createToken)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d: %s", w.Code, w.Body.String())
	}

	var createdTodo db.Todo
	if err := json.NewDecoder(w.Body).Decode(&createdTodo); err != nil {
		t.Fatalf("failed to parse created todo: %v", err)
	}
	if createdTodo.Title != "Implement Todos API" || createdTodo.Priority != "high" {
		t.Fatalf("unexpected created todo content: %+v", createdTodo)
	}

	// 4. Create an overdue todo using writeToken
	overdueBody := map[string]interface{}{
		"title":       "Overdue Task",
		"priority":    "low",
		"due_date":    "2020-01-01",
		"tags":        []string{"legacy"},
		"is_completed": false,
	}
	bodyBytes, _ = json.Marshal(overdueBody)
	req = httptest.NewRequest("POST", "/api/v1/todos", bytes.NewReader(bodyBytes))
	req.Header.Set("X-API-Key", writeToken)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for overdue task, got %d", w.Code)
	}

	// 5. List with readToken
	req = httptest.NewRequest("GET", "/api/v1/todos", nil)
	req.Header.Set("Authorization", "Bearer "+readToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list, got %d", w.Code)
	}

	var list []db.Todo
	if err := json.NewDecoder(w.Body).Decode(&list); err != nil {
		t.Fatalf("failed to decode list response: %v", err)
	}
	if len(list) != 2 {
		t.Fatalf("expected 2 todos, got %d", len(list))
	}

	// 6. Test Filtering:
	// Filter by Priority=high
	req = httptest.NewRequest("GET", "/api/v1/todos?prio=high", nil)
	req.Header.Set("Authorization", "Bearer "+readToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var prioFiltered []db.Todo
	json.NewDecoder(w.Body).Decode(&prioFiltered)
	if len(prioFiltered) != 1 || prioFiltered[0].Title != "Implement Todos API" {
		t.Fatalf("expected 1 high priority todo, got %d", len(prioFiltered))
	}

	// Filter by Overdue=true
	req = httptest.NewRequest("GET", "/api/v1/todos?overdue=true", nil)
	req.Header.Set("Authorization", "Bearer "+readToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var overdueFiltered []db.Todo
	json.NewDecoder(w.Body).Decode(&overdueFiltered)
	if len(overdueFiltered) != 1 || overdueFiltered[0].Title != "Overdue Task" {
		t.Fatalf("expected 1 overdue todo, got %d", len(overdueFiltered))
	}
	if !overdueFiltered[0].IsOverdue {
		t.Fatalf("expected IsOverdue to be true")
	}

	// Filter by Tag=backend
	req = httptest.NewRequest("GET", "/api/v1/todos?tag=backend", nil)
	req.Header.Set("Authorization", "Bearer "+readToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var tagFiltered []db.Todo
	json.NewDecoder(w.Body).Decode(&tagFiltered)
	if len(tagFiltered) != 1 {
		t.Fatalf("expected 1 tagged todo, got %d", len(tagFiltered))
	}

	// Filter by Search=handlers
	req = httptest.NewRequest("GET", "/api/v1/todos?search=handlers", nil)
	req.Header.Set("Authorization", "Bearer "+readToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var searchFiltered []db.Todo
	json.NewDecoder(w.Body).Decode(&searchFiltered)
	if len(searchFiltered) != 1 {
		t.Fatalf("expected 1 search result, got %d", len(searchFiltered))
	}

	// 7. Get single todo
	req = httptest.NewRequest("GET", "/api/v1/todos/"+createdTodo.ID, nil)
	req.Header.Set("Authorization", "Bearer "+readToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for get single, got %d", w.Code)
	}

	// 8. Update todo using writeToken
	updateBody := map[string]interface{}{
		"status":       "completed",
		"is_completed": true,
	}
	bodyBytes, _ = json.Marshal(updateBody)
	req = httptest.NewRequest("PATCH", "/api/v1/todos/"+createdTodo.ID, bytes.NewReader(bodyBytes))
	req.Header.Set("Authorization", "Bearer "+writeToken)
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for update, got %d", w.Code)
	}

	var updatedTodo db.Todo
	json.NewDecoder(w.Body).Decode(&updatedTodo)
	if !updatedTodo.IsCompleted || updatedTodo.CompletedAt == nil {
		t.Fatalf("expected completed todo with CompletedAt timestamp, got %+v", updatedTodo)
	}

	// 9. Delete todo using writeToken
	req = httptest.NewRequest("DELETE", "/api/v1/todos/"+createdTodo.ID, nil)
	req.Header.Set("Authorization", "Bearer "+writeToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content for delete, got %d", w.Code)
	}

	// Verify it's gone
	req = httptest.NewRequest("GET", "/api/v1/todos/"+createdTodo.ID, nil)
	req.Header.Set("Authorization", "Bearer "+readToken)
	w = httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for deleted todo, got %d", w.Code)
	}
}
