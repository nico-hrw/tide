package api

import (
	"bytes"
	"context"
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
	lockKey := user.ID

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

func setupSecurityFileTest(t *testing.T) (*store.SQLiteStore, store.BlobStore, chi.Router, string) {
	t.Helper()
	secret := "super-secret-test-jwt-key-with-sufficient-length-32bytes"
	t.Setenv("JWT_SECRET", secret)
	s, _ := setupTestStore(t)
	bs := store.NewLocalBlobStore(t.TempDir())
	r := chi.NewRouter()
	NewFileHandler(s, bs, NewBroker()).RegisterRoutes(r)
	return s, bs, r, secret
}

func createSecurityTestUser(t *testing.T, s *store.SQLiteStore, username string) string {
	t.Helper()
	id := uuid.New().String()
	emailHash := hashString(username + "-" + id + "@example.com")
	if err := s.CreateUser(context.Background(), &db.User{
		ID: id, EmailHash: &emailHash, Username: username, PublicKey: "pk",
		EncryptedVault: []byte("v"), EncryptedPepper: []byte("p"), CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("failed to create user %s: %v", username, err)
	}
	return id
}

func signTestJWT(t *testing.T, secret, userID string) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID, "exp": time.Now().Add(time.Hour).Unix(),
	})
	signed, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("failed to sign JWT: %v", err)
	}
	return signed
}

func TestSecurity_DevLoginBlockedInProductionEvenWithDevMode(t *testing.T) {
	t.Setenv("ENV", "production")
	t.Setenv("DEV_MODE", "true")
	_, authHandler := setupTestStore(t)

	r := chi.NewRouter()
	r.Post("/api/v1/auth/dev-login", authHandler.DevLogin)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/dev-login", strings.NewReader(`{"type":"persistent","username":"Dev Alice"}`))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected HTTP 403 Forbidden, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestSecurity_CreateFileRejectsInvalidUUIDAndQuicknoteCollision(t *testing.T) {
	s, _, r, secret := setupSecurityFileTest(t)
	ctx := context.Background()
	userID := createSecurityTestUser(t, s, "createfile-sec")
	tok := signTestJWT(t, secret, userID)

	// 1. Path traversal / invalid UUID must return 400 Bad Request
	reqBad := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"id":"../../bad","type":"note","secured_meta":"m"}`))
	reqBad.Header.Set("Authorization", "Bearer "+tok)
	reqBad.Header.Set("Content-Type", "application/json")
	recBad := httptest.NewRecorder()
	r.ServeHTTP(recBad, reqBad)
	if recBad.Code != http.StatusBadRequest {
		t.Fatalf("expected HTTP 400 for invalid id, got %d: %s", recBad.Code, recBad.Body.String())
	}

	// 2. Collision with quicknote_files ID must return 409 Conflict
	qnID := uuid.New().String()
	if _, err := s.GetOrCreateQuicknote(ctx, "sec-qn-slug", "Sec QN"); err != nil {
		t.Fatalf("GetOrCreateQuicknote failed: %v", err)
	}
	if err := s.CreateQuicknoteFile(ctx, &store.QuicknoteFile{
		ID: qnID, Slug: "sec-qn-slug", Name: "f.bin", MIMEType: "application/octet-stream", Size: 4, BlobPath: "bp", CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("CreateQuicknoteFile failed: %v", err)
	}

	reqDup := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(`{"id":"`+qnID+`","type":"note","secured_meta":"m"}`))
	reqDup.Header.Set("Authorization", "Bearer "+tok)
	reqDup.Header.Set("Content-Type", "application/json")
	recDup := httptest.NewRecorder()
	r.ServeHTTP(recDup, reqDup)
	if recDup.Code != http.StatusConflict {
		t.Fatalf("expected HTTP 409 for quicknote_files collision, got %d: %s", recDup.Code, recDup.Body.String())
	}
}

func TestSecurity_UpdateFileBlocksCollaboratorVisibilityEscalationAndCycle(t *testing.T) {
	s, _, r, secret := setupSecurityFileTest(t)
	ctx := context.Background()
	ownerID := createSecurityTestUser(t, s, "owner-sec")
	collabID := createSecurityTestUser(t, s, "collab-sec")
	fileID := uuid.New().String()

	if err := s.CreateFile(ctx, &db.File{
		ID: fileID, OwnerID: ownerID, Type: db.FileTypeNote, Visibility: "private", Version: 1,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("CreateFile failed: %v", err)
	}
	if err := s.ShareFileWithPermission(ctx, fileID, collabID, []byte("meta"), "edit", false); err != nil {
		t.Fatalf("ShareFileWithPermission failed: %v", err)
	}
	if err := s.AcceptShare(ctx, fileID, collabID); err != nil {
		t.Fatalf("AcceptShare failed: %v", err)
	}

	// 1. Edit collaborator attempting private -> public visibility escalation gets 403
	reqEsc := httptest.NewRequest(http.MethodPatch, "/"+fileID, strings.NewReader(`{"visibility":"public"}`))
	reqEsc.Header.Set("Authorization", "Bearer "+signTestJWT(t, secret, collabID))
	reqEsc.Header.Set("Content-Type", "application/json")
	recEsc := httptest.NewRecorder()
	r.ServeHTTP(recEsc, reqEsc)
	if recEsc.Code != http.StatusForbidden {
		t.Fatalf("expected HTTP 403 for collaborator visibility change, got %d: %s", recEsc.Code, recEsc.Body.String())
	}

	// 2. Setting parent_id equal to file's own id gets 400
	reqCycle := httptest.NewRequest(http.MethodPatch, "/"+fileID, strings.NewReader(`{"parent_id":"`+fileID+`"}`))
	reqCycle.Header.Set("Authorization", "Bearer "+signTestJWT(t, secret, ownerID))
	reqCycle.Header.Set("Content-Type", "application/json")
	recCycle := httptest.NewRecorder()
	r.ServeHTTP(recCycle, reqCycle)
	if recCycle.Code != http.StatusBadRequest {
		t.Fatalf("expected HTTP 400 for self-parent cycle, got %d: %s", recCycle.Code, recCycle.Body.String())
	}
}

func TestSecurity_DownloadPublicFileChecksOwnerAndHeaders(t *testing.T) {
	s, bs, r, _ := setupSecurityFileTest(t)
	ctx := context.Background()
	ownerID := createSecurityTestUser(t, s, "pub-owner")
	otherID := createSecurityTestUser(t, s, "pub-other")
	fileID := uuid.New().String()

	if err := bs.Put(ctx, fileID, strings.NewReader("public-payload")); err != nil {
		t.Fatalf("BlobStore.Put failed: %v", err)
	}
	if err := s.CreateFile(ctx, &db.File{
		ID: fileID, OwnerID: ownerID, Type: db.FileTypeFile, Visibility: "public", BlobPath: &fileID, Version: 1,
		CreatedAt: time.Now(), UpdatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("CreateFile failed: %v", err)
	}

	// 1. Mismatched userID returns 404 Not Found
	reqMismatch := httptest.NewRequest(http.MethodGet, "/public/"+otherID+"/download/"+fileID, nil)
	recMismatch := httptest.NewRecorder()
	r.ServeHTTP(recMismatch, reqMismatch)
	if recMismatch.Code != http.StatusNotFound {
		t.Fatalf("expected HTTP 404 for mismatched userID, got %d: %s", recMismatch.Code, recMismatch.Body.String())
	}

	// 2. Matching userID returns 200 OK with security headers
	reqOK := httptest.NewRequest(http.MethodGet, "/public/"+ownerID+"/download/"+fileID, nil)
	recOK := httptest.NewRecorder()
	r.ServeHTTP(recOK, reqOK)
	if recOK.Code != http.StatusOK {
		t.Fatalf("expected HTTP 200 for matching owner, got %d: %s", recOK.Code, recOK.Body.String())
	}
	if got := recOK.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("expected X-Content-Type-Options=nosniff, got %q", got)
	}
	if got := recOK.Header().Get("Content-Disposition"); got != "attachment" {
		t.Fatalf("expected Content-Disposition=attachment, got %q", got)
	}
	if recOK.Body.String() != "public-payload" {
		t.Fatalf("expected body %q, got %q", "public-payload", recOK.Body.String())
	}
}

// The web app never sends the vault PIN, so registration must succeed without one and must not
// store a PIN hash (steps that verify a PIN then fail closed).
func TestRegister_WithoutPINStoresNoPinHash(t *testing.T) {
	s, handler := setupTestStore(t)

	body, _ := json.Marshal(map[string]string{
		"email":           "nopin@example.test",
		"username":        "No Pin",
		"phone":           "000000000",
		"public_key":      "test-public-key",
		"encrypted_vault": `{"salt":"s","iv":"i","ciphertext":"c"}`,
		"pepper":          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
	})
	req := httptest.NewRequest(http.MethodPost, "/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	handler.Register(rec, req)

	if rec.Code != http.StatusOK && rec.Code != http.StatusCreated {
		t.Fatalf("expected registration without PIN to succeed, got %d: %s", rec.Code, rec.Body.String())
	}

	user, err := s.GetUserByEmailHash(context.Background(), hashString("nopin@example.test"))
	if err != nil || user == nil {
		t.Fatalf("expected user to exist: %v", err)
	}
	if user.PinHash != nil && *user.PinHash != "" {
		t.Fatalf("expected no PIN hash for a PIN-less registration, got %q", *user.PinHash)
	}
}
