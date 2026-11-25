package api

import (
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/nicoh/tide/internal/store"
)

func passkeysUnavailable(w http.ResponseWriter, err error) {
	log.Printf("Passkeys unavailable: %v", err)
	http.Error(w, "Passkeys are not available on this server", http.StatusServiceUnavailable)
}

// ListPasskeys returns the caller's passkeys (no key material).
func (h *AuthHandler) ListPasskeys(w http.ResponseWriter, r *http.Request) {
	userID := userIDFrom(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	_, cfgErr := h.passkeys()
	creds, err := h.Store.ListWebAuthnCredentials(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to load passkeys", http.StatusInternalServerError)
		return
	}
	type item struct {
		CredentialID string  `json:"credential_id"`
		Name         string  `json:"name"`
		CreatedAt    string  `json:"created_at"`
		LastUsedAt   *string `json:"last_used_at"`
	}
	items := make([]item, 0, len(creds))
	for _, c := range creds {
		it := item{CredentialID: c.CredentialID, Name: c.Name, CreatedAt: c.CreatedAt.UTC().Format(time.RFC3339)}
		if !c.LastUsedAt.IsZero() {
			s := c.LastUsedAt.UTC().Format(time.RFC3339)
			it.LastUsedAt = &s
		}
		items = append(items, it)
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"enabled": cfgErr == nil, "max": maxPasskeysPerUser, "passkeys": items})
}

// PasskeyRegisterOptions starts adding a passkey (fresh session only).
func (h *AuthHandler) PasskeyRegisterOptions(w http.ResponseWriter, r *http.Request) {
	userID := userIDFrom(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !requireFreshSession(w, r) {
		return
	}
	st, err := h.passkeys()
	if err != nil {
		passkeysUnavailable(w, err)
		return
	}
	user, err := h.loadPasskeyUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	if len(user.creds) >= maxPasskeysPerUser {
		http.Error(w, "Passkey limit reached", http.StatusConflict)
		return
	}
	exclusions := make([]protocol.CredentialDescriptor, 0, len(user.creds))
	for _, c := range user.creds {
		exclusions = append(exclusions, c.Descriptor())
	}
	creation, session, err := st.wa.BeginRegistration(user,
		webauthn.WithAuthenticatorSelection(protocol.AuthenticatorSelection{
			ResidentKey:        protocol.ResidentKeyRequirementRequired,
			RequireResidentKey: protocol.ResidentKeyRequired(),
			UserVerification:   protocol.VerificationRequired,
		}),
		webauthn.WithExclusions(exclusions),
	)
	if err != nil {
		log.Printf("PasskeyRegisterOptions: begin failed for user %s: %v", userID, err)
		http.Error(w, "Failed to start passkey registration", http.StatusInternalServerError)
		return
	}
	id, err := st.putCeremony(passkeyCeremony{session: *session, userID: userID, expiresAt: time.Now().Add(passkeyRegistrationTTL)})
	if err != nil {
		http.Error(w, "Try again shortly", http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{"ceremony_id": id, "publicKey": creation.Response})
}

// PasskeyRegisterFinish stores a new passkey together with the recovery vault that contains its
// passkey-prf envelope. Needs a fresh session and a key proof.
func (h *AuthHandler) PasskeyRegisterFinish(w http.ResponseWriter, r *http.Request) {
	userID := userIDFrom(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !requireFreshSession(w, r) {
		return
	}
	st, err := h.passkeys()
	if err != nil {
		passkeysUnavailable(w, err)
		return
	}
	var req struct {
		CeremonyID    string          `json:"ceremony_id"`
		Name          string          `json:"name"`
		Credential    json.RawMessage `json:"credential"`
		RecoveryVault string          `json:"recovery_vault"`
		keyProof
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPasskeyRequestBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || utf8.RuneCountInString(name) > maxPasskeyNameRunes {
		http.Error(w, "Passkey name must have 1 to 64 characters", http.StatusBadRequest)
		return
	}
	if err := validateRecoveryVault(req.RecoveryVault); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	ceremony, ok := st.takeCeremony(req.CeremonyID)
	if !ok || ceremony.userID != userID {
		http.Error(w, "Passkey registration expired, please start again", http.StatusBadRequest)
		return
	}
	if !h.requireKeyProof(w, userID, req.keyProof) {
		return
	}
	user, err := h.loadPasskeyUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	parsed, err := protocol.ParseCredentialCreationResponseBytes(req.Credential)
	if err != nil {
		http.Error(w, "Invalid passkey response", http.StatusBadRequest)
		return
	}
	cred, err := st.wa.CreateCredential(user, ceremony.session, parsed)
	if err != nil {
		log.Printf("PasskeyRegisterFinish: verification failed for user %s: %v", userID, err)
		http.Error(w, "Passkey could not be verified", http.StatusBadRequest)
		return
	}
	credID := credentialIDString(cred.ID)
	if passkeyEnvelopeVault(req.RecoveryVault, credID) == "" {
		http.Error(w, "recovery_vault has no envelope for this passkey", http.StatusBadRequest)
		return
	}
	record, err := json.Marshal(cred)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	transports, _ := json.Marshal(cred.Transport)
	err = h.Store.AddWebAuthnCredentialWithRecovery(r.Context(), store.WebAuthnCredential{
		CredentialID:   credID,
		UserID:         userID,
		PublicKey:      cred.PublicKey,
		SignCount:      cred.Authenticator.SignCount,
		Transports:     string(transports),
		AAGUID:         credentialAAGUID(cred),
		Name:           name,
		CredentialJSON: string(record),
		CreatedAt:      time.Now(),
	}, req.RecoveryVault, maxPasskeysPerUser)
	if errors.Is(err, store.ErrTooManyCredentials) {
		http.Error(w, "Passkey limit reached", http.StatusConflict)
		return
	}
	if err != nil {
		log.Printf("PasskeyRegisterFinish: store failed for user %s: %v", userID, err)
		http.Error(w, "Failed to store passkey", http.StatusInternalServerError)
		return
	}
	log.Printf("Passkey added for user %s", userID)
	h.notifyVaultChange(userID, noticePasskeyAdded)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"credential_id": credID})
}

func credentialAAGUID(c *webauthn.Credential) string {
	if len(c.Authenticator.AAGUID) != 16 {
		return ""
	}
	return hex.EncodeToString(c.Authenticator.AAGUID)
}

// DeletePasskey removes a passkey and its envelope (fresh session + key proof).
func (h *AuthHandler) DeletePasskey(w http.ResponseWriter, r *http.Request) {
	userID := userIDFrom(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !requireFreshSession(w, r) {
		return
	}
	var req struct {
		CredentialID string `json:"credential_id"`
		keyProof
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRecoveryBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.CredentialID == "" {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if !h.requireKeyProof(w, userID, req.keyProof) {
		return
	}
	vault, err := h.Store.GetRecoveryVault(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	var newVault *string
	if updated, removed := withoutPasskeyEnvelope(vault, req.CredentialID); removed {
		newVault = &updated
	}
	err = h.Store.DeleteWebAuthnCredentialWithRecovery(r.Context(), userID, req.CredentialID, newVault)
	if errors.Is(err, store.ErrNotFound) {
		http.Error(w, "Passkey not found", http.StatusNotFound)
		return
	}
	if err != nil {
		log.Printf("DeletePasskey: failed for user %s: %v", userID, err)
		http.Error(w, "Failed to delete passkey", http.StatusInternalServerError)
		return
	}
	log.Printf("Passkey removed for user %s", userID)
	h.notifyVaultChange(userID, noticePasskeyRemoved)
	w.WriteHeader(http.StatusNoContent)
}
