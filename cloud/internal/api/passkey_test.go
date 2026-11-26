package api

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

const (
	pkOrigin = "http://localhost:3100"
	pkRPID   = "localhost"
)

func passkeyRouter(t *testing.T) (*store.SQLiteStore, *AuthHandler, chi.Router) {
	t.Helper()
	t.Setenv("APP_URL", pkOrigin)
	t.Setenv("ALLOWED_ORIGINS", pkOrigin)
	t.Setenv("WEBAUTHN_RP_ID", "")
	s, h, r := recoveryRouter(t)
	r.With(AuthMiddleware).Get("/passkeys", h.ListPasskeys)
	r.With(AuthMiddleware).Post("/passkey/register/options", h.PasskeyRegisterOptions)
	r.With(AuthMiddleware).Post("/passkey/register/finish", h.PasskeyRegisterFinish)
	r.With(AuthMiddleware).Post("/passkey/delete", h.DeletePasskey)
	r.Post("/passkey/login/options", h.PasskeyLoginOptions)
	r.Post("/passkey/login/verify", h.PasskeyLoginVerify)
	return s, h, r
}

// createPasskeyTestUser makes a user with a real RSA public key and a server-encrypted pepper.
func createPasskeyTestUser(t *testing.T, s *store.SQLiteStore, h *AuthHandler, name string) vaultUser {
	t.Helper()
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	spki, _ := x509.MarshalPKIXPublicKey(&priv.PublicKey)
	block, _ := aes.NewCipher(h.ServerMasterKey)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, gcm.NonceSize())
	_, _ = rand.Read(nonce)
	pepper := gcm.Seal(nonce, nonce, []byte("0123456789abcdef0123456789abcdef"), nil)
	id := uuid.New().String()
	emailHash := hashString(name + "-" + id + "@example.test")
	if err := s.CreateUser(context.Background(), &db.User{
		ID: id, EmailHash: &emailHash, Username: name, PublicKey: base64.StdEncoding.EncodeToString(spki),
		EncryptedVault: []byte(testVaultOld), EncryptedPepper: pepper, CreatedAt: time.Now(),
	}); err != nil {
		t.Fatal(err)
	}
	// as after a mail-code sign-in: a notice address is known for this account
	h.rememberSessionEmail(id, name+"@example.test")
	return vaultUser{id: id, priv: priv}
}

type pkOptions struct {
	CeremonyID string `json:"ceremony_id"`
	PublicKey  struct {
		Challenge string `json:"challenge"`
		RPID      string `json:"rpId"`
		RP        struct {
			ID string `json:"id"`
		} `json:"rp"`
		User struct {
			ID string `json:"id"`
		} `json:"user"`
		UserVerification       string `json:"userVerification"`
		AuthenticatorSelection struct {
			UserVerification string `json:"userVerification"`
			ResidentKey      string `json:"residentKey"`
		} `json:"authenticatorSelection"`
	} `json:"publicKey"`
}

func decodeOptions(t *testing.T, body []byte) pkOptions {
	t.Helper()
	var o pkOptions
	if err := json.Unmarshal(body, &o); err != nil {
		t.Fatalf("options: %v (%s)", err, body)
	}
	return o
}

func passkeyVault(credID string) string {
	return `{"v":1,"envelopes":[` + mailEnvelopeJSON + `,{"kind":"passkey-prf","credentialId":"` + credID + `","prfSalt":"cA==","hkdfSalt":"aA==","iv":"aXZpdml2aXZpdml2","ciphertext":"cGFzc2tleQ=="}]}`
}

const mailEnvelopeJSON = `{"kind":"mail-secret","salt":"c2FsdA==","iv":"aXZpdml2aXZpdml2","ciphertext":"cmVjb3Zlcnk=","kdf":{"name":"PBKDF2","hash":"SHA-256","iterations":200000}}`

// registerPasskey runs options + finish for u with a soft authenticator and returns it.
func registerPasskey(t *testing.T, r chi.Router, u vaultUser, tok string) *softAuthenticator {
	t.Helper()
	rec := doJSON(t, r, http.MethodPost, "/passkey/register/options", tok, map[string]string{})
	if rec.Code != http.StatusOK {
		t.Fatalf("register options: %d %s", rec.Code, rec.Body.String())
	}
	o := decodeOptions(t, rec.Body.Bytes())
	if o.PublicKey.AuthenticatorSelection.UserVerification != "required" || o.PublicKey.AuthenticatorSelection.ResidentKey != "required" {
		t.Fatalf("registration must require UV and a discoverable credential: %+v", o.PublicKey.AuthenticatorSelection)
	}
	if o.PublicKey.RP.ID != pkRPID {
		t.Fatalf("rp id from config expected %q, got %q", pkRPID, o.PublicKey.RP.ID)
	}
	userHandle, _ := b64u.DecodeString(o.PublicKey.User.ID)
	a := newSoftAuthenticator(t)
	cred := a.create(o.PublicKey.Challenge, pkOrigin, pkRPID, userHandle)
	body := with(answer(t, r, tok, u.priv), map[string]string{"ceremony_id": o.CeremonyID, "name": "Laptop", "recovery_vault": passkeyVault(a.credentialID())})
	payload := map[string]interface{}{}
	for k, v := range body {
		payload[k] = v
	}
	payload["credential"] = cred
	rec = doJSON(t, r, http.MethodPost, "/passkey/register/finish", tok, payload)
	if rec.Code != http.StatusOK {
		t.Fatalf("register finish: %d %s", rec.Code, rec.Body.String())
	}
	return a
}

func loginOptions(t *testing.T, r chi.Router) pkOptions {
	t.Helper()
	rec := doJSON(t, r, http.MethodPost, "/passkey/login/options", "", map[string]string{})
	if rec.Code != http.StatusOK {
		t.Fatalf("login options: %d %s", rec.Code, rec.Body.String())
	}
	o := decodeOptions(t, rec.Body.Bytes())
	if o.PublicKey.UserVerification != "required" || o.PublicKey.RPID != pkRPID {
		t.Fatalf("login options must require UV for rp %q: %+v", pkRPID, o.PublicKey)
	}
	return o
}

func loginVerify(t *testing.T, r chi.Router, ceremony string, cred json.RawMessage) (int, map[string]interface{}) {
	t.Helper()
	rec := doJSON(t, r, http.MethodPost, "/passkey/login/verify", "", map[string]interface{}{"ceremony_id": ceremony, "credential": cred})
	var resp map[string]interface{}
	_ = json.Unmarshal(rec.Body.Bytes(), &resp)
	return rec.Code, resp
}

func TestPasskey_FullFlow(t *testing.T) {
	s, h, r := passkeyRouter(t)
	u := createPasskeyTestUser(t, s, h, "alice")
	tok := tokenIssuedAt(t, u.id, time.Now())
	a := registerPasskey(t, r, u, tok)

	// List shows it, without key material.
	rec := doJSON(t, r, http.MethodGet, "/passkeys", tok, nil)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"name":"Laptop"`) || strings.Contains(rec.Body.String(), "public_key") {
		t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
	}

	// Login without any session.
	o := loginOptions(t, r)
	code, resp := loginVerify(t, r, o.CeremonyID, a.get(o.PublicKey.Challenge, pkOrigin, pkRPID, flagUP|flagUV))
	if code != http.StatusOK {
		t.Fatalf("login verify: %d %v", code, resp)
	}
	for _, f := range []string{"token", "pepper", "encrypted_vault", "public_key", "user_id"} {
		if resp[f] == nil || resp[f] == "" {
			t.Fatalf("login response misses %s: %v", f, resp)
		}
	}
	if resp["user_id"] != u.id || resp["credential_id"] != a.credentialID() {
		t.Fatalf("wrong user or credential: %v", resp)
	}
	rv, _ := resp["recovery_vault"].(string)
	if !strings.Contains(rv, a.credentialID()) || strings.Contains(rv, "mail-secret") {
		t.Fatalf("login must return only the matching passkey envelope, got %q", rv)
	}
	parsed, err := jwt.Parse(resp["token"].(string), func(*jwt.Token) (interface{}, error) { return []byte(recoveryTestSecret), nil })
	if err != nil {
		t.Fatal(err)
	}
	if iat, _ := parsed.Claims.GetIssuedAt(); iat == nil || time.Since(iat.Time) > time.Minute {
		t.Fatalf("passkey session must be fresh (iat)")
	}
	stored, _ := s.GetWebAuthnCredential(context.Background(), a.credentialID())
	if stored.SignCount != 1 || stored.LastUsedAt.IsZero() {
		t.Fatalf("sign count / last use not updated: %+v", stored)
	}

	// The same ceremony cannot be used twice.
	if code, _ := loginVerify(t, r, o.CeremonyID, a.get(o.PublicKey.Challenge, pkOrigin, pkRPID, flagUP|flagUV)); code != http.StatusUnauthorized {
		t.Fatalf("replayed ceremony: expected 401, got %d", code)
	}
}

func TestPasskey_LoginRejections(t *testing.T) {
	s, h, r := passkeyRouter(t)
	u := createPasskeyTestUser(t, s, h, "bob")
	tok := tokenIssuedAt(t, u.id, time.Now())
	a := registerPasskey(t, r, u, tok)

	cases := map[string]func(o pkOptions) json.RawMessage{
		"wrong challenge": func(o pkOptions) json.RawMessage {
			return a.get(b64u.EncodeToString([]byte("not-the-server-challenge-0123456")), pkOrigin, pkRPID, flagUP|flagUV)
		},
		"wrong origin": func(o pkOptions) json.RawMessage {
			return a.get(o.PublicKey.Challenge, "https://evil.example", pkRPID, flagUP|flagUV)
		},
		"wrong rp id": func(o pkOptions) json.RawMessage {
			return a.get(o.PublicKey.Challenge, pkOrigin, "evil.example", flagUP|flagUV)
		},
		"no user verification": func(o pkOptions) json.RawMessage {
			return a.get(o.PublicKey.Challenge, pkOrigin, pkRPID, flagUP)
		},
	}
	for name, mk := range cases {
		o := loginOptions(t, r)
		if code, resp := loginVerify(t, r, o.CeremonyID, mk(o)); code != http.StatusUnauthorized || resp["token"] != nil {
			t.Fatalf("%s: expected 401 without token, got %d %v", name, code, resp)
		}
	}

	// Sign counter going backwards (clone) is rejected.
	o := loginOptions(t, r)
	a.counter = 10
	if code, _ := loginVerify(t, r, o.CeremonyID, a.get(o.PublicKey.Challenge, pkOrigin, pkRPID, flagUP|flagUV)); code != http.StatusOK {
		t.Fatalf("counter 11 login: %d", code)
	}
	o = loginOptions(t, r)
	a.counter = 3
	if code, _ := loginVerify(t, r, o.CeremonyID, a.get(o.PublicKey.Challenge, pkOrigin, pkRPID, flagUP|flagUV)); code != http.StatusUnauthorized {
		t.Fatalf("counter regression: expected 401, got %d", code)
	}
}

func TestPasskey_AccountWithoutCredentialCannotLogin(t *testing.T) {
	s, h, r := passkeyRouter(t)
	u := createPasskeyTestUser(t, s, h, "nopk")
	// An authenticator that claims this user's handle but was never registered.
	a := newSoftAuthenticator(t)
	a.userID = []byte(u.id)
	o := loginOptions(t, r)
	if code, resp := loginVerify(t, r, o.CeremonyID, a.get(o.PublicKey.Challenge, pkOrigin, pkRPID, flagUP|flagUV)); code != http.StatusUnauthorized || resp["token"] != nil {
		t.Fatalf("account without passkey must not sign in, got %d %v", code, resp)
	}
}

func TestPasskey_RegisterAndDeleteNeedFreshSessionAndProof(t *testing.T) {
	s, h, r := passkeyRouter(t)
	u := createPasskeyTestUser(t, s, h, "carol")
	tok := tokenIssuedAt(t, u.id, time.Now())
	old := tokenIssuedAt(t, u.id, time.Now().Add(-time.Hour))

	if rec := doJSON(t, r, http.MethodPost, "/passkey/register/options", old, map[string]string{}); rec.Code != http.StatusForbidden {
		t.Fatalf("stale session options: expected 403, got %d", rec.Code)
	}

	// Finish without key proof.
	rec := doJSON(t, r, http.MethodPost, "/passkey/register/options", tok, map[string]string{})
	o := decodeOptions(t, rec.Body.Bytes())
	userHandle, _ := b64u.DecodeString(o.PublicKey.User.ID)
	a := newSoftAuthenticator(t)
	cred := a.create(o.PublicKey.Challenge, pkOrigin, pkRPID, userHandle)
	rec = doJSON(t, r, http.MethodPost, "/passkey/register/finish", tok, map[string]interface{}{
		"ceremony_id": o.CeremonyID, "name": "X", "recovery_vault": passkeyVault(a.credentialID()), "credential": cred,
	})
	if rec.Code != http.StatusForbidden {
		t.Fatalf("finish without proof: expected 403, got %d", rec.Code)
	}

	// Envelope for a different credential is refused.
	rec = doJSON(t, r, http.MethodPost, "/passkey/register/options", tok, map[string]string{})
	o = decodeOptions(t, rec.Body.Bytes())
	cred = a.create(o.PublicKey.Challenge, pkOrigin, pkRPID, userHandle)
	payload := map[string]interface{}{"ceremony_id": o.CeremonyID, "name": "X", "recovery_vault": passkeyVault("someone-else"), "credential": cred}
	for k, v := range answer(t, r, tok, u.priv) {
		payload[k] = v
	}
	if rec := doJSON(t, r, http.MethodPost, "/passkey/register/finish", tok, payload); rec.Code != http.StatusBadRequest {
		t.Fatalf("mismatched envelope: expected 400, got %d", rec.Code)
	}

	// Wrong origin at registration.
	rec = doJSON(t, r, http.MethodPost, "/passkey/register/options", tok, map[string]string{})
	o = decodeOptions(t, rec.Body.Bytes())
	payload = map[string]interface{}{"ceremony_id": o.CeremonyID, "name": "X", "recovery_vault": passkeyVault(a.credentialID()), "credential": a.create(o.PublicKey.Challenge, "https://evil.example", pkRPID, userHandle)}
	for k, v := range answer(t, r, tok, u.priv) {
		payload[k] = v
	}
	if rec := doJSON(t, r, http.MethodPost, "/passkey/register/finish", tok, payload); rec.Code != http.StatusBadRequest {
		t.Fatalf("wrong origin at registration: expected 400, got %d", rec.Code)
	}
	if list, _ := s.ListWebAuthnCredentials(context.Background(), u.id); len(list) != 0 {
		t.Fatalf("no passkey may be stored after failed registrations, got %d", len(list))
	}

	// Real registration, then delete.
	pk := registerPasskey(t, r, u, tok)
	if rec := doJSON(t, r, http.MethodPost, "/passkey/delete", tok, map[string]string{"credential_id": pk.credentialID()}); rec.Code != http.StatusForbidden {
		t.Fatalf("delete without proof: expected 403, got %d", rec.Code)
	}
	if rec := doJSON(t, r, http.MethodPost, "/passkey/delete", old, with(answer(t, r, tok, u.priv), map[string]string{"credential_id": pk.credentialID()})); rec.Code != http.StatusForbidden {
		t.Fatalf("delete with stale session: expected 403, got %d", rec.Code)
	}
	other := createPasskeyTestUser(t, s, h, "mallory")
	otherTok := tokenIssuedAt(t, other.id, time.Now())
	if rec := doJSON(t, r, http.MethodPost, "/passkey/delete", otherTok, with(answer(t, r, otherTok, other.priv), map[string]string{"credential_id": pk.credentialID()})); rec.Code != http.StatusNotFound {
		t.Fatalf("foreign delete: expected 404, got %d", rec.Code)
	}
	if rec := doJSON(t, r, http.MethodPost, "/passkey/delete", tok, with(answer(t, r, tok, u.priv), map[string]string{"credential_id": pk.credentialID()})); rec.Code != http.StatusNoContent {
		t.Fatalf("delete: expected 204, got %d %s", rec.Code, rec.Body.String())
	}
	rv, _ := s.GetRecoveryVault(context.Background(), u.id)
	if strings.Contains(rv, pk.credentialID()) || !strings.Contains(rv, "mail-secret") {
		t.Fatalf("delete must drop only the passkey envelope, got %q", rv)
	}
	o2 := loginOptions(t, r)
	if code, _ := loginVerify(t, r, o2.CeremonyID, pk.get(o2.PublicKey.Challenge, pkOrigin, pkRPID, flagUP|flagUV)); code != http.StatusUnauthorized {
		t.Fatalf("deleted passkey must not sign in, got %d", code)
	}
}

func TestPasskeyConfig_FromEnvOnly(t *testing.T) {
	t.Setenv("WEBAUTHN_RP_ID", "")
	t.Setenv("APP_URL", "https://hrw.rocks")
	t.Setenv("ALLOWED_ORIGINS", "https://hrw.rocks,http://hrw.rocks,https://evil.example,http://localhost:3000")
	wa, err := passkeyConfigFromEnv()
	if err != nil {
		t.Fatal(err)
	}
	if wa.Config.RPID != "hrw.rocks" || len(wa.Config.RPOrigins) != 1 || wa.Config.RPOrigins[0] != "https://hrw.rocks" {
		t.Fatalf("unexpected RP config: %q %v", wa.Config.RPID, wa.Config.RPOrigins)
	}
	t.Setenv("APP_URL", "")
	t.Setenv("ALLOWED_ORIGINS", "")
	if _, err := passkeyConfigFromEnv(); err == nil {
		t.Fatal("without configuration passkeys must be disabled")
	}
}
