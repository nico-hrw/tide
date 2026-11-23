package api_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/api"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

func createBackupTestJWT(t *testing.T, userID string) string {
	t.Helper()
	secret := "test-backups-jwt-secret-key-32b!"
	t.Setenv("JWT_SECRET", secret)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign test JWT: %v", err)
	}
	return signed
}

func setupBackupsTestEnv(t *testing.T) (chi.Router, *store.SQLiteStore, string, string, string) {
	t.Helper()
	s, tempDir := setupTestStore(t)
	t.Cleanup(func() {
		_ = s.Close()
		_ = os.RemoveAll(tempDir)
	})

	ctx := context.Background()
	userID := "user-backups-" + uuid.New().String()
	if err := s.CreateUser(ctx, &db.User{
		ID:              userID,
		EncryptedVault:  []byte("vault"),
		EncryptedPepper: []byte("pepper"),
		PublicKey:       "pubkey",
		CreatedAt:       time.Now().UTC(),
	}); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	fileID := uuid.New().String()
	now := time.Now().UTC()
	if err := s.CreateFile(ctx, &db.File{
		ID:         fileID,
		OwnerID:    userID,
		Type:       db.FileTypeNote,
		Visibility: "private",
		CreatedAt:  now,
		UpdatedAt:  now,
	}); err != nil {
		t.Fatalf("failed to create file: %v", err)
	}

	r := chi.NewRouter()
	fileHandler := api.NewFileHandler(s, nil, nil)
	r.Route("/api/v1/files", fileHandler.RegisterRoutes)

	token := createBackupTestJWT(t, userID)
	return r, s, userID, fileID, token
}

func TestGetFileBackups_EmptyReturnsArray(t *testing.T) {
	r, _, _, fileID, token := setupBackupsTestEnv(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID+"/backups", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	body := strings.TrimSpace(w.Body.String())
	if body != "[]" {
		t.Fatalf("expected empty JSON array [], got %q", body)
	}
}

func TestUpdateFileBackup_ValidationErrors(t *testing.T) {
	r, _, _, fileID, token := setupBackupsTestEnv(t)

	t.Run("rejects empty encrypted_blob", func(t *testing.T) {
		payload, _ := json.Marshal(map[string]interface{}{
			"encrypted_blob": "",
		})
		req := httptest.NewRequest(http.MethodPut, "/api/v1/files/"+fileID+"/backups/10%20minutes", bytes.NewReader(payload))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for empty encrypted_blob, got %d: %s", w.Code, w.Body.String())
		}
	})

	t.Run("rejects invalid slot name", func(t *testing.T) {
		payload, _ := json.Marshal(map[string]interface{}{
			"encrypted_blob": base64.StdEncoding.EncodeToString([]byte("backup-data")),
		})
		req := httptest.NewRequest(http.MethodPut, "/api/v1/files/"+fileID+"/backups/invalid-slot", bytes.NewReader(payload))
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("expected 400 Bad Request for invalid slot name, got %d: %s", w.Code, w.Body.String())
		}
	})
}

func TestUpdateFileBackup_ValidSlotDefaultsVersionAndPreservesPastUpdatedAt(t *testing.T) {
	r, _, _, fileID, token := setupBackupsTestEnv(t)

	pastTime := time.Date(2025, 1, 15, 12, 30, 0, 0, time.UTC)
	rawBlob := []byte("encrypted-backup-payload")
	payload, _ := json.Marshal(map[string]interface{}{
		"encrypted_blob": base64.StdEncoding.EncodeToString(rawBlob),
		"updated_at":     pastTime.Format(time.RFC3339Nano),
	})

	putReq := httptest.NewRequest(http.MethodPut, "/api/v1/files/"+fileID+"/backups/10%20minutes", bytes.NewReader(payload))
	putReq.Header.Set("Authorization", "Bearer "+token)
	putReq.Header.Set("Content-Type", "application/json")
	putRec := httptest.NewRecorder()
	r.ServeHTTP(putRec, putReq)

	if putRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content, got %d: %s", putRec.Code, putRec.Body.String())
	}

	// Verify via GetFileBackup
	getOneReq := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID+"/backups/10%20minutes", nil)
	getOneReq.Header.Set("Authorization", "Bearer "+token)
	getOneRec := httptest.NewRecorder()
	r.ServeHTTP(getOneRec, getOneReq)

	if getOneRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from GetFileBackup, got %d: %s", getOneRec.Code, getOneRec.Body.String())
	}

	var gotOne db.FileBackup
	if err := json.Unmarshal(getOneRec.Body.Bytes(), &gotOne); err != nil {
		t.Fatalf("failed to decode GetFileBackup response: %v", err)
	}
	if gotOne.SlotName != "10 minutes" {
		t.Fatalf("expected slot_name %q, got %q", "10 minutes", gotOne.SlotName)
	}
	if gotOne.Version < 1 {
		t.Fatalf("expected defaulted version >= 1, got %d", gotOne.Version)
	}
	if !gotOne.UpdatedAt.UTC().Equal(pastTime) {
		t.Fatalf("expected updated_at %s, got %s", pastTime.Format(time.RFC3339Nano), gotOne.UpdatedAt.UTC().Format(time.RFC3339Nano))
	}
	if !bytes.Equal(gotOne.EncryptedBlob, rawBlob) {
		t.Fatalf("expected encrypted_blob %q, got %q", rawBlob, gotOne.EncryptedBlob)
	}

	// Verify via GetFileBackups
	getAllReq := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID+"/backups", nil)
	getAllReq.Header.Set("Authorization", "Bearer "+token)
	getAllRec := httptest.NewRecorder()
	r.ServeHTTP(getAllRec, getAllReq)

	if getAllRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from GetFileBackups, got %d: %s", getAllRec.Code, getAllRec.Body.String())
	}

	var gotAll []db.FileBackup
	if err := json.Unmarshal(getAllRec.Body.Bytes(), &gotAll); err != nil {
		t.Fatalf("failed to decode GetFileBackups response: %v", err)
	}
	if len(gotAll) != 1 {
		t.Fatalf("expected 1 backup, got %d", len(gotAll))
	}
	if gotAll[0].SlotName != "10 minutes" {
		t.Fatalf("expected slot_name %q, got %q", "10 minutes", gotAll[0].SlotName)
	}
	if gotAll[0].Version < 1 {
		t.Fatalf("expected defaulted version >= 1 in list, got %d", gotAll[0].Version)
	}
	if !gotAll[0].UpdatedAt.UTC().Equal(pastTime) {
		t.Fatalf("expected list updated_at %s, got %s", pastTime.Format(time.RFC3339Nano), gotAll[0].UpdatedAt.UTC().Format(time.RFC3339Nano))
	}
}

func TestUpdateFileBackup_ClampsFutureUpdatedAt(t *testing.T) {
	r, _, _, fileID, token := setupBackupsTestEnv(t)

	futureTime := time.Now().UTC().Add(24 * time.Hour)
	payload, _ := json.Marshal(map[string]interface{}{
		"encrypted_blob": base64.StdEncoding.EncodeToString([]byte("future-clamp-payload")),
		"updated_at":     futureTime.Format(time.RFC3339Nano),
	})

	putReq := httptest.NewRequest(http.MethodPut, "/api/v1/files/"+fileID+"/backups/1%20hour", bytes.NewReader(payload))
	putReq.Header.Set("Authorization", "Bearer "+token)
	putReq.Header.Set("Content-Type", "application/json")
	putRec := httptest.NewRecorder()
	r.ServeHTTP(putRec, putReq)
	afterPut := time.Now().UTC()

	if putRec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content, got %d: %s", putRec.Code, putRec.Body.String())
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID+"/backups/1%20hour", nil)
	getReq.Header.Set("Authorization", "Bearer "+token)
	getRec := httptest.NewRecorder()
	r.ServeHTTP(getRec, getReq)

	if getRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK from GetFileBackup, got %d: %s", getRec.Code, getRec.Body.String())
	}

	var got db.FileBackup
	if err := json.Unmarshal(getRec.Body.Bytes(), &got); err != nil {
		t.Fatalf("failed to decode GetFileBackup response: %v", err)
	}
	if got.UpdatedAt.UTC().After(afterPut) {
		t.Fatalf("expected future updated_at to be clamped <= %s, got %s", afterPut.Format(time.RFC3339Nano), got.UpdatedAt.UTC().Format(time.RFC3339Nano))
	}
}

func TestGetFileBackup_MissingSlotReturnsNotFound(t *testing.T) {
	r, _, _, fileID, token := setupBackupsTestEnv(t)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/files/"+fileID+"/backups/1%20week", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Fatalf("expected 404 Not Found for missing slot, got %d: %s", w.Code, w.Body.String())
	}
}
