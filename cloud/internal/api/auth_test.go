package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

func setupTestStore(t *testing.T) (*store.SQLiteStore, *AuthHandler) {
	t.Helper()
	s, err := store.NewSQLiteStore(t.TempDir())
	if err != nil {
		t.Fatalf("failed to init sqlite store: %v", err)
	}
	t.Cleanup(func() {
		_ = s.Close()
	})
	masterKey := make([]byte, 32)
	copy(masterKey, []byte("01234567890123456789012345678901"))
	handler := NewAuthHandler(s, masterKey)
	return s, handler
}

// 1. TestRequestOTP_NoOTPInResponse verifies that requesting an OTP returns HTTP 200
// and completely omits the OTP code in the response body (zero-leakage).
func TestRequestOTP_NoOTPInResponse(t *testing.T) {
	origEnv := os.Getenv("ENV")
	os.Setenv("ENV", "development")
	defer os.Setenv("ENV", origEnv)

	sqliteStore, authHandler := setupTestStore(t)

	testEmail := "otp-test-user@example.com"
	emailHash := hashString(testEmail)
	testUser := &db.User{
		ID:              uuid.New().String(),
		EmailHash:       &emailHash,
		Username:        "otptester",
		PublicKey:       "test-pubkey",
		EncryptedVault:  []byte("test-vault"),
		EncryptedPepper: []byte("test-pepper"),
		CreatedAt:       time.Now(),
	}
	if err := sqliteStore.CreateUser(context.Background(), testUser); err != nil {
		t.Fatalf("failed to create test user: %v", err)
	}

	r := chi.NewRouter()
	r.Route("/api/v1/auth", func(auth chi.Router) {
		auth.Post("/request-otp", authHandler.RequestOTP)
	})

	bodyBytes, err := json.Marshal(map[string]string{
		"email": testEmail,
	})
	if err != nil {
		t.Fatalf("failed to marshal request body: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/request-otp", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()

	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 OK, got %d. Body: %s", rec.Code, rec.Body.String())
	}

	var resp map[string]interface{}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to parse JSON response body: %v", err)
	}

	// Verify user was recognized
	if exists, ok := resp["user_exists"].(bool); !ok || !exists {
		t.Fatalf("expected user_exists == true, got %v", resp["user_exists"])
	}

	// Zero-leakage check: assert key "otp" and "code" are absent or empty
	if val, exists := resp["otp"]; exists && val != nil && val != "" {
		t.Fatalf("security violation: OTP leaked in response body: %v", val)
	}
	if val, exists := resp["code"]; exists && val != nil && val != "" {
		t.Fatalf("security violation: code leaked in response body: %v", val)
	}
}

// 2. TestArgon2idPIN_VerificationAndMigration verifies Argon2id hashing,
// verification with correct/wrong PIN, and transparent migration of legacy SHA-256 hashes.
func TestArgon2idPIN_VerificationAndMigration(t *testing.T) {
	sqliteStore, authHandler := setupTestStore(t)
	ctx := context.Background()

	pin := "849201"

	// Part A: Test hashPinArgon2id generates $argon2id$ format
	hash, err := hashPinArgon2id(pin)
	if err != nil {
		t.Fatalf("failed to hash pin with argon2id: %v", err)
	}
	if !strings.HasPrefix(hash, "$argon2id$") {
		t.Fatalf("expected hash to have $argon2id$ prefix, got %q", hash)
	}

	// Part B: Test verifyAndMigratePin with Argon2id hash
	testUserID := uuid.New().String()
	if !authHandler.verifyAndMigratePin(ctx, testUserID, pin, hash) {
		t.Fatalf("expected verifyAndMigratePin to return true for correct PIN")
	}
	if authHandler.verifyAndMigratePin(ctx, testUserID, "000000", hash) {
		t.Fatalf("expected verifyAndMigratePin to return false for wrong PIN")
	}

	// Part C: Test migration of legacy SHA-256 hash
	legacyPin := "654321"
	legacyHash := hashString(legacyPin) // 64-char hex SHA-256

	legacyUserID := uuid.New().String()
	legacyEmail := "legacy-user@example.com"
	legacyEmailHash := hashString(legacyEmail)
	legacyUser := &db.User{
		ID:              legacyUserID,
		EmailHash:       &legacyEmailHash,
		Username:        "legacyuser",
		PublicKey:       "legacy-pubkey",
		EncryptedVault:  []byte("legacy-vault"),
		EncryptedPepper: []byte("legacy-pepper"),
		PinHash:         &legacyHash,
		CreatedAt:       time.Now(),
	}
	if err := sqliteStore.CreateUser(ctx, legacyUser); err != nil {
		t.Fatalf("failed to create legacy user: %v", err)
	}

	// Verifying with correct PIN must return true and trigger transparent migration
	if !authHandler.verifyAndMigratePin(ctx, legacyUserID, legacyPin, legacyHash) {
		t.Fatalf("expected verifyAndMigratePin to return true for legacy SHA-256 hash with correct PIN")
	}

	// Assert stored hash in DB is now updated to Argon2id
	updatedUser, err := sqliteStore.GetUser(ctx, legacyUserID)
	if err != nil {
		t.Fatalf("failed to reload user from store: %v", err)
	}
	if updatedUser.PinHash == nil || *updatedUser.PinHash == "" {
		t.Fatalf("expected updated PIN hash in store, got empty/nil")
	}
	if !strings.HasPrefix(*updatedUser.PinHash, "$argon2id$") {
		t.Fatalf("expected migrated PIN hash to start with $argon2id$, got %q", *updatedUser.PinHash)
	}
	if *updatedUser.PinHash == legacyHash {
		t.Fatalf("expected stored hash to be migrated from legacy SHA-256, but found unchanged")
	}

	// Verify the migrated hash in DB works with correct PIN and rejects wrong PIN
	if !authHandler.verifyAndMigratePin(ctx, legacyUserID, legacyPin, *updatedUser.PinHash) {
		t.Fatalf("expected migrated hash to verify successfully with correct PIN")
	}
	if authHandler.verifyAndMigratePin(ctx, legacyUserID, "wrong-pin", *updatedUser.PinHash) {
		t.Fatalf("expected migrated hash to reject wrong PIN")
	}
}

// 3. TestPIN_BruteForceLockout verifies that repeated failed PIN verification attempts
// trigger lockout (HTTP 429 Too Many Requests), and a successful PIN verification resets the count.
func TestPIN_BruteForceLockout(t *testing.T) {
	sqliteStore, authHandler := setupTestStore(t)
	ctx := context.Background()

	testEmail := "lockout-test@example.com"
	emailHash := hashString(testEmail)
	correctPin := "789123"
	argonHash, err := hashPinArgon2id(correctPin)
	if err != nil {
		t.Fatalf("failed to hash pin: %v", err)
	}

	user := &db.User{
		ID:              uuid.New().String(),
		EmailHash:       &emailHash,
		Username:        "lockoutuser",
		PublicKey:       "lockout-pubkey",
		EncryptedVault:  []byte("vault"),
		EncryptedPepper: []byte("pepper"),
		PinHash:         &argonHash,
		CreatedAt:       time.Now(),
	}
	if err := sqliteStore.CreateUser(ctx, user); err != nil {
		t.Fatalf("failed to create user: %v", err)
	}

	r := chi.NewRouter()
	r.Post("/api/v1/auth/verify-pin", authHandler.VerifyPin)

	testRemoteAddr := "192.168.1.100:1234"
	lockKey := fmt.Sprintf("%s:%s", testRemoteAddr, user.ID)

	wrongPinBody, _ := json.Marshal(map[string]string{
		"email": testEmail,
		"pin":   "000000",
	})

	// Call VerifyPin with wrong PIN 5 times
	for i := 1; i <= 5; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/verify-pin", bytes.NewReader(wrongPinBody))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = testRemoteAddr
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d: expected HTTP 401, got %d", i, rec.Code)
		}
	}

	// 6th attempt: Exceeds max attempts -> receives HTTP 429 Too Many Requests
	{
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/verify-pin", bytes.NewReader(wrongPinBody))
		req.Header.Set("Content-Type", "application/json")
		req.RemoteAddr = testRemoteAddr
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)

		if rec.Code != http.StatusTooManyRequests {
			t.Fatalf("attempt 6: expected HTTP 429 Too Many Requests while locked out, got %d", rec.Code)
		}
	}

	// Assert tracker confirms lockout
	if authHandler.pinLimiter != nil {
		if locked, _ := authHandler.pinLimiter.IsLocked(lockKey); !locked {
			t.Fatalf("expected lockKey %s to be locked in pinLimiter", lockKey)
		}
		// Reset lockout / failure count so correct PIN can be verified
		authHandler.pinLimiter.RecordSuccess(lockKey)
	}

	// Verify that correct PIN succeeds with HTTP 200
	correctPinBody, _ := json.Marshal(map[string]string{
		"email": testEmail,
		"pin":   correctPin,
	})
	reqSuccess := httptest.NewRequest(http.MethodPost, "/api/v1/auth/verify-pin", bytes.NewReader(correctPinBody))
	reqSuccess.Header.Set("Content-Type", "application/json")
	reqSuccess.RemoteAddr = testRemoteAddr
	recSuccess := httptest.NewRecorder()
	r.ServeHTTP(recSuccess, reqSuccess)

	if recSuccess.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 for correct PIN, got %d. Body: %s", recSuccess.Code, recSuccess.Body.String())
	}

	// Assert correct PIN reset the failure count
	if authHandler.pinLimiter != nil {
		if locked, _ := authHandler.pinLimiter.IsLocked(lockKey); locked {
			t.Fatalf("expected failure count to be reset and key not locked after success")
		}
	}

	// A single subsequent wrong attempt must not lock out immediately
	reqWrongAfter := httptest.NewRequest(http.MethodPost, "/api/v1/auth/verify-pin", bytes.NewReader(wrongPinBody))
	reqWrongAfter.Header.Set("Content-Type", "application/json")
	reqWrongAfter.RemoteAddr = testRemoteAddr
	recWrongAfter := httptest.NewRecorder()
	r.ServeHTTP(recWrongAfter, reqWrongAfter)

	if recWrongAfter.Code != http.StatusUnauthorized {
		t.Fatalf("expected HTTP 401 for single wrong attempt after reset, got %d", recWrongAfter.Code)
	}
}

// 4. TestAuthMiddleware_Protection verifies that AuthMiddleware rejects requests without
// token or with invalid tokens (HTTP 401), and permits valid JWT tokens with context injection.
func TestAuthMiddleware_Protection(t *testing.T) {
	origSecret := os.Getenv("JWT_SECRET")
	testSecret := "super-secret-test-jwt-key-with-sufficient-length-32bytes"
	os.Setenv("JWT_SECRET", testSecret)
	defer os.Setenv("JWT_SECRET", origSecret)

	var extractedUserID string
	dummyHandler := AuthMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if uid, ok := r.Context().Value("user_id").(string); ok {
			extractedUserID = uid
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("access-granted"))
	}))

	// Case 1: No Authorization header -> HTTP 401
	{
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		rec := httptest.NewRecorder()
		dummyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected HTTP 401 for missing token, got %d", rec.Code)
		}
	}

	// Case 2: Invalid token -> HTTP 401
	{
		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("Authorization", "Bearer invalid-tampered-token")
		rec := httptest.NewRecorder()
		dummyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusUnauthorized {
			t.Fatalf("expected HTTP 401 for invalid token, got %d", rec.Code)
		}
	}

	// Case 3: Valid token signed with JWT_SECRET -> HTTP 200 & user_id in context
	{
		expectedUID := "user-jwt-test-uuid-42"
		claims := jwt.MapClaims{
			"sub": expectedUID,
			"exp": time.Now().Add(1 * time.Hour).Unix(),
		}
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signedToken, err := tok.SignedString([]byte(testSecret))
		if err != nil {
			t.Fatalf("failed to sign test token: %v", err)
		}

		req := httptest.NewRequest(http.MethodGet, "/protected", nil)
		req.Header.Set("Authorization", "Bearer "+signedToken)
		rec := httptest.NewRecorder()
		dummyHandler.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected HTTP 200 for valid token, got %d", rec.Code)
		}
		if extractedUserID != expectedUID {
			t.Fatalf("expected user_id in context to be %q, got %q", expectedUID, extractedUserID)
		}
	}
}
