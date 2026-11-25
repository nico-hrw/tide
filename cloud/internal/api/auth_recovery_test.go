package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

const recoveryTestSecret = "recovery-test-jwt-secret-with-enough-length-0123"

const (
	testVaultOld  = `{"salt":"c2FsdA==","iv":"aXZpdml2aXZpdml2","ciphertext":"b2xkLXZhdWx0"}`
	testVaultNew  = `{"salt":"c2FsdA==","iv":"bmV3aXZuZXdpdm5l","ciphertext":"bmV3LXZhdWx0"}`
	testVaultNew2 = `{"salt":"c2FsdA==","iv":"bmV3aXZuZXdpdm5l","ciphertext":"bmV3LXZhdWx0LTI="}`
	testRecovery  = `{"v":1,"envelopes":[{"kind":"mail-secret","salt":"c2FsdA==","iv":"aXZpdml2aXZpdml2","ciphertext":"cmVjb3Zlcnk=","kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":200000}}]}`
	testRecovery2 = `{"v":1,"envelopes":[{"kind":"mail-secret","salt":"c2FsdA==","iv":"aXZpdml2aXZpdml2","ciphertext":"cmVjb3ZlcnktMg==","kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":200000}}]}`
)

type vaultUser struct {
	id   string
	priv *rsa.PrivateKey
}

func recoveryRouter(t *testing.T) (*store.SQLiteStore, *AuthHandler, chi.Router) {
	t.Helper()
	t.Setenv("JWT_SECRET", recoveryTestSecret)
	t.Setenv("RESEND_API_KEY", "")
	s, h := setupTestStore(t)
	r := chi.NewRouter()
	r.With(AuthMiddleware).Get("/recovery-vault", h.GetRecoveryVault)
	r.With(AuthMiddleware).Put("/recovery-vault", h.PutRecoveryVault)
	r.With(AuthMiddleware).Post("/replace-vault", h.ReplaceVault)
	r.With(AuthMiddleware).Post("/key-challenge", h.KeyChallenge)
	return s, h, r
}

// tokenIssuedAt signs a session token; a zero iat produces a token without the claim.
func tokenIssuedAt(t *testing.T, userID string, iat time.Time) string {
	t.Helper()
	claims := jwt.MapClaims{"sub": userID, "exp": time.Now().Add(time.Hour).Unix()}
	if !iat.IsZero() {
		claims["iat"] = iat.Unix()
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(recoveryTestSecret))
	if err != nil {
		t.Fatalf("sign: %v", err)
	}
	return signed
}

func doJSON(t *testing.T, r chi.Router, method, path, token string, body interface{}) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

// createVaultUser stores a user whose public_key is a real SPKI (base64), like the web client sends.
func createVaultUser(t *testing.T, s *store.SQLiteStore, name string) vaultUser {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("rsa: %v", err)
	}
	spki, err := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	if err != nil {
		t.Fatalf("spki: %v", err)
	}
	id := uuid.New().String()
	emailHash := hashString(name + "-" + id + "@example.test")
	if err := s.CreateUser(context.Background(), &db.User{
		ID: id, EmailHash: &emailHash, Username: name, PublicKey: base64.StdEncoding.EncodeToString(spki),
		EncryptedVault: []byte(testVaultOld), EncryptedPepper: []byte("p"), CreatedAt: time.Now(),
	}); err != nil {
		t.Fatalf("create user: %v", err)
	}
	return vaultUser{id: id, priv: priv}
}

// answer fetches a key challenge as u and decrypts it with key (RSA-OAEP SHA-256, as WebCrypto does).
func answer(t *testing.T, r chi.Router, token string, key *rsa.PrivateKey) map[string]string {
	t.Helper()
	rec := doJSON(t, r, http.MethodPost, "/key-challenge", token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("key-challenge: %d %s", rec.Code, rec.Body.String())
	}
	var c struct {
		ID        string `json:"challenge_id"`
		Challenge string `json:"challenge"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &c)
	ct, _ := base64.StdEncoding.DecodeString(c.Challenge)
	plain, err := rsa.DecryptOAEP(sha256.New(), nil, key, ct, nil)
	if err != nil {
		t.Fatalf("decrypt challenge: %v", err)
	}
	return map[string]string{"challenge_id": c.ID, "challenge_response": base64.StdEncoding.EncodeToString(plain)}
}

func with(base map[string]string, extra map[string]string) map[string]string {
	out := map[string]string{}
	for k, v := range base {
		out[k] = v
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

func TestReplaceVault_RoundTripKeepsPreviousGenerations(t *testing.T) {
	s, h, r := recoveryRouter(t)
	u := createVaultUser(t, s, "fresh")
	if err := s.SetRecoveryVault(context.Background(), u.id, testRecovery); err != nil {
		t.Fatal(err)
	}
	h.rememberSessionEmail(u.id, "fresh@example.test")
	tok := tokenIssuedAt(t, u.id, time.Now())

	rec := doJSON(t, r, http.MethodPost, "/replace-vault", tok, with(answer(t, r, tok, u.priv), map[string]string{
		"encrypted_vault": testVaultNew,
		"recovery_vault":  testRecovery2,
	}))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	got, _ := s.GetUser(context.Background(), u.id)
	if string(got.EncryptedVault) != testVaultNew {
		t.Fatalf("vault not replaced: %s", got.EncryptedVault)
	}
	if prev, _ := s.GetEncryptedVaultPrev(context.Background(), u.id); prev != testVaultOld {
		t.Fatalf("previous vault not kept, got %q", prev)
	}
	if rv, _ := s.GetRecoveryVault(context.Background(), u.id); rv != testRecovery2 {
		t.Fatalf("recovery vault not stored, got %q", rv)
	}
	if rp, _ := s.GetRecoveryVaultPrev(context.Background(), u.id); rp != testRecovery {
		t.Fatalf("previous recovery vault not kept, got %q", rp)
	}
	if at, _ := s.GetVaultReplacedAt(context.Background(), u.id); time.Since(at) > time.Minute {
		t.Fatalf("vault_replaced_at not set, got %v", at)
	}

	// Second replacement within 24 h: refused, original stays in prev.
	rec = doJSON(t, r, http.MethodPost, "/replace-vault", tok, with(answer(t, r, tok, u.priv), map[string]string{"encrypted_vault": testVaultNew2}))
	if rec.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 cooldown, got %d: %s", rec.Code, rec.Body.String())
	}
	if prev, _ := s.GetEncryptedVaultPrev(context.Background(), u.id); prev != testVaultOld {
		t.Fatalf("cooldown must protect the previous vault, got %q", prev)
	}

	// After the window it is allowed again.
	if err := s.ReplaceEncryptedVault(context.Background(), u.id, []byte(testVaultNew2), nil, time.Now().Add(25*time.Hour), vaultReplaceCooldown); err != nil {
		t.Fatalf("replace after cooldown: %v", err)
	}
}

func TestReplaceVault_RequiresKeyProof(t *testing.T) {
	s, _, r := recoveryRouter(t)
	u := createVaultUser(t, s, "proof")
	other := createVaultUser(t, s, "other")
	tok := tokenIssuedAt(t, u.id, time.Now())
	body := map[string]string{"encrypted_vault": testVaultNew}

	if rec := doJSON(t, r, http.MethodPost, "/replace-vault", tok, body); rec.Code != http.StatusForbidden {
		t.Fatalf("no proof: expected 403, got %d", rec.Code)
	}
	wrong := answer(t, r, tok, u.priv)
	wrong["challenge_response"] = base64.StdEncoding.EncodeToString(make([]byte, 32))
	if rec := doJSON(t, r, http.MethodPost, "/replace-vault", tok, with(wrong, body)); rec.Code != http.StatusForbidden {
		t.Fatalf("wrong answer: expected 403, got %d", rec.Code)
	}
	// Decrypting with someone else's key does not work (OAEP fails), so fake the other way round:
	// another user's valid answer is not accepted for this user.
	otherTok := tokenIssuedAt(t, other.id, time.Now())
	otherProof := answer(t, r, otherTok, other.priv)
	if rec := doJSON(t, r, http.MethodPost, "/replace-vault", tok, with(otherProof, body)); rec.Code != http.StatusForbidden {
		t.Fatalf("foreign challenge: expected 403, got %d", rec.Code)
	}
	// One-time: a correct answer works once, the replay is refused.
	proof := answer(t, r, tok, u.priv)
	if rec := doJSON(t, r, http.MethodPut, "/recovery-vault", tok, with(proof, map[string]string{"recovery_vault": testRecovery})); rec.Code != http.StatusOK {
		t.Fatalf("first use: expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	if rec := doJSON(t, r, http.MethodPut, "/recovery-vault", tok, with(proof, map[string]string{"recovery_vault": testRecovery2})); rec.Code != http.StatusForbidden {
		t.Fatalf("replay: expected 403, got %d", rec.Code)
	}
	got, _ := s.GetUser(context.Background(), u.id)
	if string(got.EncryptedVault) != testVaultOld {
		t.Fatalf("vault must be unchanged")
	}
	if rv, _ := s.GetRecoveryVault(context.Background(), u.id); rv != testRecovery {
		t.Fatalf("replay must not change the recovery vault, got %q", rv)
	}
}

func TestKeyChallenge_Expires(t *testing.T) {
	s, h, r := recoveryRouter(t)
	u := createVaultUser(t, s, "expire")
	tok := tokenIssuedAt(t, u.id, time.Now())
	proof := answer(t, r, tok, u.priv)
	h.mu.Lock()
	c := h.keyChallenges[proof["challenge_id"]]
	c.expiresAt = time.Now().Add(-time.Second)
	h.keyChallenges[proof["challenge_id"]] = c
	h.mu.Unlock()
	if rec := doJSON(t, r, http.MethodPost, "/replace-vault", tok, with(proof, map[string]string{"encrypted_vault": testVaultNew})); rec.Code != http.StatusForbidden {
		t.Fatalf("expired challenge: expected 403, got %d", rec.Code)
	}
}

func TestReplaceVault_StaleOrMissingIatIsForbidden(t *testing.T) {
	s, _, r := recoveryRouter(t)
	u := createVaultUser(t, s, "stale")
	freshTok := tokenIssuedAt(t, u.id, time.Now())

	for name, tok := range map[string]string{
		"old":    tokenIssuedAt(t, u.id, time.Now().Add(-11*time.Minute)),
		"no-iat": tokenIssuedAt(t, u.id, time.Time{}),
		"future": tokenIssuedAt(t, u.id, time.Now().Add(10*time.Minute)),
	} {
		// Even with a valid key proof a stale session is refused.
		if rec := doJSON(t, r, http.MethodPost, "/replace-vault", tok, with(answer(t, r, freshTok, u.priv), map[string]string{"encrypted_vault": testVaultNew})); rec.Code != http.StatusForbidden {
			t.Fatalf("%s: expected 403, got %d", name, rec.Code)
		}
		if rec := doJSON(t, r, http.MethodPut, "/recovery-vault", tok, with(answer(t, r, freshTok, u.priv), map[string]string{"recovery_vault": testRecovery})); rec.Code != http.StatusForbidden {
			t.Fatalf("%s: expected 403 for PUT recovery-vault, got %d", name, rec.Code)
		}
	}
	got, _ := s.GetUser(context.Background(), u.id)
	if string(got.EncryptedVault) != testVaultOld {
		t.Fatalf("vault must be unchanged after forbidden calls")
	}
	if rv, _ := s.GetRecoveryVault(context.Background(), u.id); rv != "" {
		t.Fatalf("recovery vault must stay empty, got %q", rv)
	}
}

func TestReplaceVault_RejectsMalformedVaults(t *testing.T) {
	s, _, r := recoveryRouter(t)
	u := createVaultUser(t, s, "malformed")
	tok := tokenIssuedAt(t, u.id, time.Now())
	bad := []map[string]string{
		{"encrypted_vault": ""},
		{"encrypted_vault": "not json"},
		{"encrypted_vault": `{"salt":"c2FsdA==","iv":"","ciphertext":"eA=="}`},
		{"encrypted_vault": `{"salt":"c2FsdA==","iv":"eA==","ciphertext":"###"}`},
		{"encrypted_vault": testVaultNew, "recovery_vault": `{"v":2,"envelopes":[]}`},
		{"encrypted_vault": testVaultNew, "recovery_vault": `{"v":1,"envelopes":[{"kind":"BAD KIND","iv":"eA==","ciphertext":"eA=="}]}`},
		{"encrypted_vault": string(bytes.Repeat([]byte("a"), maxEncryptedVaultBytes+1))},
	}
	for i, b := range bad {
		if rec := doJSON(t, r, http.MethodPost, "/replace-vault", tok, with(answer(t, r, tok, u.priv), b)); rec.Code != http.StatusBadRequest {
			t.Fatalf("case %d: expected 400, got %d", i, rec.Code)
		}
	}
}

func TestRecoveryVault_OnlyOwnAndStatusFlag(t *testing.T) {
	s, _, r := recoveryRouter(t)
	alice := createVaultUser(t, s, "alice")
	bob := createVaultUser(t, s, "bob")
	aliceTok := tokenIssuedAt(t, alice.id, time.Now())

	if rec := doJSON(t, r, http.MethodPut, "/recovery-vault", aliceTok, with(answer(t, r, aliceTok, alice.priv), map[string]string{"recovery_vault": testRecovery})); rec.Code != http.StatusOK {
		t.Fatalf("PUT expected 200, got %d: %s", rec.Code, rec.Body.String())
	}

	rec := doJSON(t, r, http.MethodGet, "/recovery-vault", tokenIssuedAt(t, bob.id, time.Now().Add(-48*time.Hour)), nil)
	var bobResp map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &bobResp)
	if rec.Code != http.StatusOK || bobResp["has_recovery"] != false || bobResp["recovery_vault"] != nil {
		t.Fatalf("bob must see nothing, got %d %v", rec.Code, bobResp)
	}

	rec = doJSON(t, r, http.MethodGet, "/recovery-vault", tokenIssuedAt(t, alice.id, time.Time{}), nil)
	var aliceResp map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &aliceResp)
	if aliceResp["has_recovery"] != true || aliceResp["recovery_vault"] != testRecovery {
		t.Fatalf("alice must get her vault, got %v", aliceResp)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("recovery vault response must not be cached")
	}

	rec = doJSON(t, r, http.MethodGet, "/recovery-vault?status=1", tokenIssuedAt(t, alice.id, time.Time{}), nil)
	var statusResp map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &statusResp)
	if _, has := statusResp["recovery_vault"]; has || statusResp["has_recovery"] != true {
		t.Fatalf("status call must only carry the flag, got %v", statusResp)
	}

	if rec := doJSON(t, r, http.MethodGet, "/recovery-vault", "", nil); rec.Code != http.StatusUnauthorized {
		t.Fatalf("anonymous GET expected 401, got %d", rec.Code)
	}
}

func registerBody(email string, extra map[string]string) map[string]string {
	return with(map[string]string{
		"email":           email,
		"username":        "Reg",
		"phone":           "000000000",
		"public_key":      "pk",
		"encrypted_vault": testVaultOld,
		"pepper":          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
	}, extra)
}

func TestRegister_RecoveryVaultOptional(t *testing.T) {
	s, h := setupTestStore(t)
	r := chi.NewRouter()
	r.Post("/register", h.Register)

	rec := doJSON(t, r, http.MethodPost, "/register", "", registerBody("without@example.test", nil))
	if rec.Code != http.StatusCreated {
		t.Fatalf("register without recovery expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	u, _ := s.GetUserByEmailHash(context.Background(), hashString("without@example.test"))
	if rv, _ := s.GetRecoveryVault(context.Background(), u.ID); rv != "" {
		t.Fatalf("expected no recovery vault, got %q", rv)
	}

	rec = doJSON(t, r, http.MethodPost, "/register", "", registerBody("with@example.test", map[string]string{"recovery_vault": testRecovery}))
	if rec.Code != http.StatusCreated {
		t.Fatalf("register with recovery expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	if resp["recovery_saved"] != true {
		t.Fatalf("expected recovery_saved true, got %v", resp)
	}
	u, _ = s.GetUserByEmailHash(context.Background(), hashString("with@example.test"))
	if rv, _ := s.GetRecoveryVault(context.Background(), u.ID); rv != testRecovery {
		t.Fatalf("recovery vault not stored at registration, got %q", rv)
	}

	rec = doJSON(t, r, http.MethodPost, "/register", "", registerBody("bad@example.test", map[string]string{"recovery_vault": "{nope"}))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("malformed recovery vault expected 400, got %d", rec.Code)
	}
	if _, err := s.GetUserByEmailHash(context.Background(), hashString("bad@example.test")); err == nil {
		t.Fatalf("no user may be created with a malformed recovery vault")
	}
}

func TestVerifyOTP_TokenCarriesIssuedAtAndRemembersAddress(t *testing.T) {
	t.Setenv("JWT_SECRET", recoveryTestSecret)
	t.Setenv("ENV", "development")
	t.Setenv("RESEND_API_KEY", "")
	s, h := setupTestStore(t)
	r := chi.NewRouter()
	r.Post("/register", h.Register)
	r.Post("/request-otp", h.RequestOTP)
	r.Post("/verify-otp", h.VerifyOTP)

	email := "iat@example.test"
	if rec := doJSON(t, r, http.MethodPost, "/register", "", registerBody(email, map[string]string{"recovery_vault": testRecovery})); rec.Code != http.StatusCreated {
		t.Fatalf("register: %d", rec.Code)
	}
	doJSON(t, r, http.MethodPost, "/request-otp", "", map[string]string{"email": email})
	u, _ := s.GetUserByEmailHash(context.Background(), hashString(email))
	h.mu.Lock()
	code := h.otpCache[u.ID].Code
	h.mu.Unlock()

	rec := doJSON(t, r, http.MethodPost, "/verify-otp", "", map[string]string{"email": email, "otp": code})
	if rec.Code != http.StatusOK {
		t.Fatalf("verify-otp: %d %s", rec.Code, rec.Body.String())
	}
	if bytes.Contains(rec.Body.Bytes(), []byte("recovery_vault")) {
		t.Fatalf("verify-otp must not return the recovery vault")
	}
	var resp struct {
		Token string `json:"token"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	parsed, err := jwt.Parse(resp.Token, func(*jwt.Token) (interface{}, error) { return []byte(recoveryTestSecret), nil })
	if err != nil {
		t.Fatalf("parse token: %v", err)
	}
	iat, err := parsed.Claims.GetIssuedAt()
	if err != nil || iat == nil || time.Since(iat.Time) > time.Minute {
		t.Fatalf("token must carry a current iat, got %v (%v)", iat, err)
	}
	if got := h.sessionEmailFor(u.ID); got != email {
		t.Fatalf("session address not remembered for notices, got %q", got)
	}
}

func TestSecurityNoticeTextHasNoSecrets(t *testing.T) {
	for _, kind := range []string{noticeVaultReplaced, noticeRecoverySetup} {
		subject, body := securityNoticeText(kind, time.Now())
		if subject == "" || !bytes.Contains([]byte(body), []byte("Warst du das nicht")) {
			t.Fatalf("%s: notice text incomplete", kind)
		}
	}
}
