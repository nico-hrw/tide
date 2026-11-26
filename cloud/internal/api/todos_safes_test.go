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

// Todos carry a workspace (safe) and extra linked workspaces, like notes do.
func TestTodosAPI_WorkspaceFields(t *testing.T) {
	s, tempDir := setupTestStore(t)
	defer os.RemoveAll(tempDir)

	userID := "user-todo-safes"
	if err := s.CreateUser(context.Background(), &db.User{
		ID: userID, EncryptedVault: []byte("v"), EncryptedPepper: []byte("p"), PublicKey: "pk", CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	r := chi.NewRouter()
	r.Route("/api/v1/todos", api.NewTodosHandler(s).RegisterRoutes)
	token := createTestToken(t, s, userID, []string{"todos:create", "todos:read", "todos:write"})

	do := func(method, path string, body any) *httptest.ResponseRecorder {
		var rd *bytes.Reader
		if body != nil {
			b, _ := json.Marshal(body)
			rd = bytes.NewReader(b)
		} else {
			rd = bytes.NewReader(nil)
		}
		req := httptest.NewRequest(method, path, rd)
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		return rec
	}

	// Created without a workspace: defaults to main, no extra links.
	rec := do(http.MethodPost, "/api/v1/todos", map[string]any{"title": "Plain"})
	if rec.Code != http.StatusCreated && rec.Code != http.StatusOK {
		t.Fatalf("create plain: %d %s", rec.Code, rec.Body.String())
	}
	var plain struct {
		ID          string   `json:"id"`
		Safe        string   `json:"safe"`
		LinkedSafes []string `json:"linked_safes"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &plain)
	if plain.Safe != "main" || len(plain.LinkedSafes) != 0 {
		t.Fatalf("expected main and no links, got %+v", plain)
	}

	// Created in Studium, shown also in Privat (and a duplicate and the legacy name are normalised).
	rec = do(http.MethodPost, "/api/v1/todos", map[string]any{
		"title": "Lernen", "safe": "Studium", "linked_safes": []string{"Privat", "Privat", "Standard"},
	})
	var created struct {
		ID          string   `json:"id"`
		Safe        string   `json:"safe"`
		LinkedSafes []string `json:"linked_safes"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &created)
	if created.Safe != "Studium" || len(created.LinkedSafes) != 2 || created.LinkedSafes[0] != "Privat" || created.LinkedSafes[1] != "main" {
		t.Fatalf("unexpected create result: %+v", created)
	}

	// Read back from the store.
	rec = do(http.MethodGet, "/api/v1/todos/"+created.ID, nil)
	var got struct {
		Safe        string   `json:"safe"`
		LinkedSafes []string `json:"linked_safes"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Safe != "Studium" || len(got.LinkedSafes) != 2 {
		t.Fatalf("read back mismatch: %s", rec.Body.String())
	}

	// Update moves it to Arbeit and drops the links.
	rec = do(http.MethodPut, "/api/v1/todos/"+created.ID, map[string]any{
		"safe": "Arbeit", "linked_safes": []string{},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("update: %d %s", rec.Code, rec.Body.String())
	}
	rec = do(http.MethodGet, "/api/v1/todos/"+created.ID, nil)
	// Fresh value: an empty linked_safes is omitted from the JSON, so nothing may be carried over.
	var updated struct {
		Safe        string   `json:"safe"`
		LinkedSafes []string `json:"linked_safes"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &updated)
	if updated.Safe != "Arbeit" || len(updated.LinkedSafes) != 0 {
		t.Fatalf("update not applied: %s", rec.Body.String())
	}
}
