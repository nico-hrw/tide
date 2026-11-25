package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
)

// A passkey sign-in unlocks the app, but cannot change vault, recovery vault or passkeys: that needs a
// mail-code session whose address is known, so the owner receives a notice.
func TestPasskeySession_CannotChangeVaultOrPasskeys(t *testing.T) {
	s, h, r := passkeyRouter(t)
	u := createPasskeyTestUser(t, s, h, "dora")
	otpTok := tokenWithAuth(t, u.id, authMethodOTP)
	a := registerPasskey(t, r, u, otpTok)

	o := loginOptions(t, r)
	code, resp := loginVerify(t, r, o.CeremonyID, a.get(o.PublicKey.Challenge, pkOrigin, pkRPID, flagUP|flagUV))
	if code != http.StatusOK {
		t.Fatalf("passkey login: %d %v", code, resp)
	}
	pkTok := resp["token"].(string)
	parsed, _ := jwt.Parse(pkTok, func(*jwt.Token) (interface{}, error) { return []byte(recoveryTestSecret), nil })
	if claims, _ := parsed.Claims.(jwt.MapClaims); claims["auth"] != authMethodPasskey {
		t.Fatalf("passkey token must be marked, got %v", claims["auth"])
	}

	// Even with a key proof and a known notice address, the passkey session is refused.
	checks := []struct {
		path string
		body map[string]string
	}{
		{"/replace-vault", map[string]string{"encrypted_vault": testVaultNew}},
		{"/passkey/register/options", map[string]string{}},
		{"/passkey/delete", map[string]string{"credential_id": a.credentialID()}},
	}
	for _, c := range checks {
		rec := doJSON(t, r, http.MethodPost, c.path, pkTok, with(answer(t, r, pkTok, u.priv), c.body))
		if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "Mail sign-in required") {
			t.Fatalf("%s with passkey session: expected 403 mail sign-in required, got %d %s", c.path, rec.Code, rec.Body.String())
		}
	}
	rec := doJSON(t, r, http.MethodPut, "/recovery-vault", pkTok, with(answer(t, r, pkTok, u.priv), map[string]string{"recovery_vault": testRecovery}))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("PUT recovery-vault with passkey session: expected 403, got %d", rec.Code)
	}

	// A fresh mail-code session without a known address (e.g. after a server restart) is refused too.
	other := createPasskeyTestUser(t, s, h, "erin")
	h.mu.Lock()
	delete(h.sessionEmails, other.id)
	h.mu.Unlock()
	otherTok := tokenWithAuth(t, other.id, authMethodOTP)
	rec = doJSON(t, r, http.MethodPost, "/replace-vault", otherTok, with(answer(t, r, otherTok, other.priv), map[string]string{"encrypted_vault": testVaultNew}))
	if rec.Code != http.StatusForbidden {
		t.Fatalf("session without notice address: expected 403, got %d", rec.Code)
	}
}

func tokenWithAuth(t *testing.T, userID, method string) string {
	t.Helper()
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": userID, "iat": time.Now().Unix(), "exp": time.Now().Add(time.Hour).Unix(), "auth": method,
	}).SignedString([]byte(recoveryTestSecret))
	if err != nil {
		t.Fatal(err)
	}
	return signed
}

func postFrom(r chi.Router, ip, path, token string, body interface{}) *httptest.ResponseRecorder {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.RemoteAddr = ip + ":40000"
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

// A flood of anonymous login ceremonies must not block a signed-in user's registration, and one
// client cannot evict another client's open login.
func TestPasskeyCeremonies_FloodIsolation(t *testing.T) {
	s, h, r := passkeyRouter(t)
	u := createPasskeyTestUser(t, s, h, "frank")
	tok := tokenWithAuth(t, u.id, authMethodOTP)
	st, err := h.passkeys()
	if err != nil {
		t.Fatal(err)
	}
	st.logins = newCeremonyStore(50, 5)

	// A legitimate login from 10.0.0.1 is open.
	rec := postFrom(r, "10.0.0.1", "/passkey/login/options", "", map[string]string{})
	if rec.Code != http.StatusOK {
		t.Fatalf("legit login options: %d", rec.Code)
	}
	legit := decodeOptions(t, rec.Body.Bytes())

	// One attacker IP floods: it only ever holds its own 5 ceremonies.
	for i := 0; i < 200; i++ {
		if rec := postFrom(r, "203.0.113.9", "/passkey/login/options", "", map[string]string{}); rec.Code != http.StatusOK {
			t.Fatalf("single-IP flood should evict its own oldest, got %d at %d", rec.Code, i)
		}
	}
	st.logins.mu.Lock()
	_, stillOpen := st.logins.items[legit.CeremonyID]
	st.logins.mu.Unlock()
	if !stillOpen {
		t.Fatal("another client's flood evicted a legitimate login ceremony")
	}

	// Many IPs fill the login store completely ...
	full := false
	for i := 0; i < 100 && !full; i++ {
		ip := fmt.Sprintf("198.51.100.%d", i)
		for j := 0; j < 5; j++ {
			if rec := postFrom(r, ip, "/passkey/login/options", "", map[string]string{}); rec.Code == http.StatusServiceUnavailable {
				full = true
				break
			}
		}
	}
	if !full {
		t.Fatal("expected the capped login store to fill up")
	}
	// ... and a signed-in user can still start a registration.
	if rec := postFrom(r, "10.0.0.2", "/passkey/register/options", tok, map[string]string{}); rec.Code != http.StatusOK {
		t.Fatalf("registration must not depend on the login store, got %d %s", rec.Code, rec.Body.String())
	}
	// Registration ceremonies are capped per user (own oldest evicted), never failing for the user.
	for i := 0; i < 10; i++ {
		if rec := postFrom(r, "10.0.0.2", "/passkey/register/options", tok, map[string]string{}); rec.Code != http.StatusOK {
			t.Fatalf("repeated registration options: %d", rec.Code)
		}
	}
	st.registration.mu.Lock()
	n := len(st.registration.items)
	st.registration.mu.Unlock()
	if n > maxRegCeremoniesPerUser {
		t.Fatalf("registration ceremonies per user must be capped at %d, got %d", maxRegCeremoniesPerUser, n)
	}
}
