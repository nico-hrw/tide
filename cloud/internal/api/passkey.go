package api

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
)

// Passkeys (WebAuthn, github.com/go-webauthn/webauthn).
//
// The server stores only the public credential record. The PRF output that opens the passkey
// envelope in recovery_vault never leaves the client. Relying party ID and origins come from the
// configuration (WEBAUTHN_RP_ID, else the host of APP_URL; origins from APP_URL and ALLOWED_ORIGINS),
// never from request headers. Without that configuration passkeys are disabled.

const (
	passkeyEnvelopeKind     = "passkey-prf"
	maxPasskeysPerUser      = 10
	passkeyLoginTTL         = 2 * time.Minute
	passkeyRegistrationTTL  = 5 * time.Minute
	maxLoginCeremonies      = 10000
	maxLoginCeremoniesPerIP = 10
	maxRegCeremonies        = 10000
	maxRegCeremoniesPerUser = 3
	maxPasskeyNameRunes     = 64
	maxPasskeyRequestBytes  = 96 * 1024
	passkeyRPDisplayName    = "Tide"
	noticePasskeyAdded      = "passkey-added"
	noticePasskeyRemoved    = "passkey-removed"
)

type passkeyCeremony struct {
	session   webauthn.SessionData
	userID    string // empty for discoverable login
	owner     string // client IP (login) or user ID (registration), for the per-owner cap
	createdAt time.Time
	expiresAt time.Time
}

// ceremonyStore keeps open WebAuthn ceremonies in memory. Each store has a total cap and a cap per
// owner; an owner at its cap loses its own oldest ceremony, so one client cannot crowd out others.
// Login and registration use separate stores, so anonymous login traffic can never block a
// signed-in user's registration.
type ceremonyStore struct {
	mu          sync.Mutex
	items       map[string]passkeyCeremony
	capTotal    int
	capPerOwner int
}

func newCeremonyStore(total, perOwner int) *ceremonyStore {
	return &ceremonyStore{items: make(map[string]passkeyCeremony), capTotal: total, capPerOwner: perOwner}
}

var errCeremoniesFull = errors.New("too many open passkey ceremonies")

func (cs *ceremonyStore) put(c passkeyCeremony) (string, error) {
	idBytes := make([]byte, 24)
	if _, err := rand.Read(idBytes); err != nil {
		return "", err
	}
	id := base64.RawURLEncoding.EncodeToString(idBytes)
	now := time.Now()
	c.createdAt = now
	cs.mu.Lock()
	defer cs.mu.Unlock()
	oldestID, owned := "", 0
	for k, v := range cs.items {
		if now.After(v.expiresAt) {
			delete(cs.items, k)
			continue
		}
		if v.owner == c.owner {
			owned++
			if oldestID == "" || v.createdAt.Before(cs.items[oldestID].createdAt) {
				oldestID = k
			}
		}
	}
	if owned >= cs.capPerOwner && oldestID != "" {
		delete(cs.items, oldestID)
	}
	if len(cs.items) >= cs.capTotal {
		return "", errCeremoniesFull
	}
	cs.items[id] = c
	return id, nil
}

// take returns and always removes the ceremony (one-time use).
func (cs *ceremonyStore) take(id string) (passkeyCeremony, bool) {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	c, ok := cs.items[id]
	delete(cs.items, id)
	if !ok || time.Now().After(c.expiresAt) {
		return passkeyCeremony{}, false
	}
	return c, true
}

type passkeyState struct {
	once         sync.Once
	wa           *webauthn.WebAuthn
	initErr      error
	logins       *ceremonyStore
	registration *ceremonyStore
}

// requestIP mirrors the client key used by RateLimitMiddleware.
func requestIP(r *http.Request) string {
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		ip = r.RemoteAddr
	}
	ip = strings.Trim(strings.TrimSpace(ip), "[]")
	if ip == "" {
		ip = "unknown"
	}
	return ip
}

// passkeyUser adapts a Tide user to webauthn.User. The user handle is the user's UUID.
type passkeyUser struct {
	id    string
	name  string
	creds []webauthn.Credential
}

func (u *passkeyUser) WebAuthnID() []byte                         { return []byte(u.id) }
func (u *passkeyUser) WebAuthnName() string                       { return u.name }
func (u *passkeyUser) WebAuthnDisplayName() string                { return u.name }
func (u *passkeyUser) WebAuthnCredentials() []webauthn.Credential { return u.creds }

func originOf(raw string) (string, string, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", "", false
	}
	return u.Scheme + "://" + u.Host, u.Hostname(), true
}

// passkeyConfigFromEnv builds the relying party from the server configuration.
func passkeyConfigFromEnv() (*webauthn.WebAuthn, error) {
	appOrigin, appHost, appOK := originOf(os.Getenv("APP_URL"))
	rpID := strings.ToLower(strings.TrimSpace(os.Getenv("WEBAUTHN_RP_ID")))
	if rpID == "" && appOK {
		rpID = strings.ToLower(appHost)
	}
	if rpID == "" {
		return nil, errors.New("passkeys disabled: APP_URL or WEBAUTHN_RP_ID not configured")
	}
	candidates := []string{}
	if appOK {
		candidates = append(candidates, appOrigin)
	}
	for _, o := range strings.Split(os.Getenv("ALLOWED_ORIGINS"), ",") {
		candidates = append(candidates, o)
	}
	seen := map[string]bool{}
	origins := []string{}
	for _, c := range candidates {
		origin, host, ok := originOf(c)
		host = strings.ToLower(host)
		// An origin is only usable when the RP ID is its host or a parent domain of it.
		if !ok || seen[origin] || !(host == rpID || strings.HasSuffix(host, "."+rpID)) {
			continue
		}
		// Plain http only for localhost development.
		if strings.HasPrefix(origin, "http://") && host != "localhost" {
			continue
		}
		seen[origin] = true
		origins = append(origins, origin)
	}
	if len(origins) == 0 {
		return nil, fmt.Errorf("passkeys disabled: no allowed origin matches RP ID %q", rpID)
	}
	return webauthn.New(&webauthn.Config{RPID: rpID, RPDisplayName: passkeyRPDisplayName, RPOrigins: origins})
}

func (h *AuthHandler) passkeys() (*passkeyState, error) {
	h.mu.Lock()
	if h.passkey == nil {
		h.passkey = &passkeyState{
			logins:       newCeremonyStore(maxLoginCeremonies, maxLoginCeremoniesPerIP),
			registration: newCeremonyStore(maxRegCeremonies, maxRegCeremoniesPerUser),
		}
	}
	st := h.passkey
	h.mu.Unlock()
	st.once.Do(func() { st.wa, st.initErr = passkeyConfigFromEnv() })
	return st, st.initErr
}

func credentialIDString(id []byte) string { return base64.RawURLEncoding.EncodeToString(id) }

// loadPasskeyUser loads a user and their stored credentials as go-webauthn records.
func (h *AuthHandler) loadPasskeyUser(ctx context.Context, userID string) (*passkeyUser, error) {
	user, err := h.Store.GetUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	stored, err := h.Store.ListWebAuthnCredentials(ctx, userID)
	if err != nil {
		return nil, err
	}
	u := &passkeyUser{id: user.ID, name: user.Username, creds: make([]webauthn.Credential, 0, len(stored))}
	if u.name == "" {
		u.name = "Tide"
	}
	for _, s := range stored {
		var c webauthn.Credential
		if err := json.Unmarshal([]byte(s.CredentialJSON), &c); err != nil {
			return nil, err
		}
		u.creds = append(u.creds, c)
	}
	return u, nil
}

// recoveryEnvelopes splits a recovery vault into raw envelopes.
func recoveryEnvelopes(vault string) ([]json.RawMessage, error) {
	if vault == "" {
		return nil, nil
	}
	var v struct {
		Envelopes []json.RawMessage `json:"envelopes"`
	}
	if err := json.Unmarshal([]byte(vault), &v); err != nil {
		return nil, err
	}
	return v.Envelopes, nil
}

func envelopeMatches(raw json.RawMessage, credentialID string) bool {
	var e struct {
		Kind         string `json:"kind"`
		CredentialID string `json:"credentialId"`
	}
	return json.Unmarshal(raw, &e) == nil && e.Kind == passkeyEnvelopeKind && e.CredentialID == credentialID
}

func vaultFromEnvelopes(envs []json.RawMessage) string {
	if len(envs) == 0 {
		return ""
	}
	b, _ := json.Marshal(struct {
		V         int               `json:"v"`
		Envelopes []json.RawMessage `json:"envelopes"`
	}{1, envs})
	return string(b)
}

// passkeyEnvelopeVault returns a recovery vault holding only the passkey envelope of credentialID ("" if none).
func passkeyEnvelopeVault(vault, credentialID string) string {
	envs, err := recoveryEnvelopes(vault)
	if err != nil {
		return ""
	}
	for _, e := range envs {
		if envelopeMatches(e, credentialID) {
			return vaultFromEnvelopes([]json.RawMessage{e})
		}
	}
	return ""
}

// withoutPasskeyEnvelope removes the envelope of credentialID from a recovery vault.
func withoutPasskeyEnvelope(vault, credentialID string) (string, bool) {
	envs, err := recoveryEnvelopes(vault)
	if err != nil {
		return vault, false
	}
	kept := make([]json.RawMessage, 0, len(envs))
	removed := false
	for _, e := range envs {
		if envelopeMatches(e, credentialID) {
			removed = true
			continue
		}
		kept = append(kept, e)
	}
	return vaultFromEnvelopes(kept), removed
}
