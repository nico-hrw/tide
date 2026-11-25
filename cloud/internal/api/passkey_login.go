package api

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// Passkey sign-in without a prior session (discoverable credentials, user verification required).
// Success issues the same session as verify-otp (JWT with iat, cookie) and the same fields, plus the
// recovery vault reduced to the envelope of the passkey that was used. Only accounts with a
// registered credential can sign in this way.

// PasskeyLoginOptions starts a discoverable login. The challenge lives only in memory.
func (h *AuthHandler) PasskeyLoginOptions(w http.ResponseWriter, r *http.Request) {
	st, err := h.passkeys()
	if err != nil {
		passkeysUnavailable(w, err)
		return
	}
	assertion, session, err := st.wa.BeginDiscoverableLogin(webauthn.WithUserVerification(protocol.VerificationRequired))
	if err != nil {
		http.Error(w, "Failed to start passkey login", http.StatusInternalServerError)
		return
	}
	id, err := st.putCeremony(passkeyCeremony{session: *session, expiresAt: time.Now().Add(passkeyLoginTTL)})
	if err != nil {
		http.Error(w, "Try again shortly", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"ceremony_id": id, "publicKey": assertion.Response})
}

var errPasskeyRejected = errors.New("passkey rejected")

// PasskeyLoginVerify checks the assertion and signs the user in.
func (h *AuthHandler) PasskeyLoginVerify(w http.ResponseWriter, r *http.Request) {
	st, err := h.passkeys()
	if err != nil {
		passkeysUnavailable(w, err)
		return
	}
	var req struct {
		CeremonyID string          `json:"ceremony_id"`
		Credential json.RawMessage `json:"credential"`
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPasskeyRequestBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	ceremony, ok := st.takeCeremony(req.CeremonyID)
	if !ok || ceremony.userID != "" {
		http.Error(w, "Passkey login expired, please try again", http.StatusUnauthorized)
		return
	}
	parsed, err := protocol.ParseCredentialRequestResponseBytes(req.Credential)
	if err != nil {
		http.Error(w, "Invalid passkey response", http.StatusBadRequest)
		return
	}
	handler := func(rawID, userHandle []byte) (webauthn.User, error) {
		u, err := h.loadPasskeyUser(r.Context(), string(userHandle))
		if err != nil || len(u.creds) == 0 {
			return nil, errPasskeyRejected
		}
		return u, nil
	}
	waUser, cred, err := st.wa.ValidatePasskeyLogin(handler, ceremony.session, parsed)
	if err != nil {
		log.Printf("PasskeyLoginVerify: rejected: %v", err)
		http.Error(w, "Passkey not accepted", http.StatusUnauthorized)
		return
	}
	userID := string(waUser.WebAuthnID())
	credID := credentialIDString(cred.ID)
	if cred.Authenticator.CloneWarning {
		log.Printf("PasskeyLoginVerify: sign counter went backwards for a passkey of user %s, possible clone", userID)
		http.Error(w, "Passkey not accepted", http.StatusUnauthorized)
		return
	}
	if record, err := json.Marshal(cred); err == nil {
		if err := h.Store.UpdateWebAuthnCredentialUse(r.Context(), credID, cred.Authenticator.SignCount, string(record), time.Now()); err != nil {
			log.Printf("PasskeyLoginVerify: could not update counter for user %s: %v", userID, err)
		}
	}
	user, err := h.Store.GetUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "Passkey not accepted", http.StatusUnauthorized)
		return
	}
	resp, ok := h.issueSignIn(w, r, user, "PasskeyLogin")
	if !ok {
		return
	}
	resp["credential_id"] = credID
	vault, _ := h.Store.GetRecoveryVault(r.Context(), userID)
	if env := passkeyEnvelopeVault(vault, credID); env != "" {
		resp["recovery_vault"] = env
	} else {
		resp["recovery_vault"] = nil
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(resp)
}
