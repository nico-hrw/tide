package api

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/nicoh/tide/internal/store"
)

// Vault recovery endpoints.
//
// The server never learns the PIN or the recovery secret. It only stores two opaque, client-encrypted
// wrappings of the user's private key (encrypted_vault, recovery_vault) and lets a freshly signed-in
// session replace them. "Fresh" means the JWT was issued (iat) by an OTP sign-in at most
// freshSessionMaxAge ago; tokens without iat are never fresh.

type ctxKey string

const tokenIssuedAtKey ctxKey = "token_iat"

const (
	freshSessionMaxAge     = 10 * time.Minute
	freshSessionClockSkew  = 1 * time.Minute
	maxEncryptedVaultBytes = 16 * 1024
	maxRecoveryVaultBytes  = 32 * 1024
	maxRecoveryEnvelopes   = 8
	maxRecoveryBodyBytes   = 64 * 1024
	// A replaced vault keeps its predecessor in encrypted_vault_prev; a second replacement within
	// this window would overwrite that rollback copy, so it is refused.
	vaultReplaceCooldown = 24 * time.Hour
)

var envelopeKindPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,31}$`)

// sessionIsFresh reports whether the request's session token was issued recently enough.
func sessionIsFresh(r *http.Request, now time.Time) bool {
	iat, ok := r.Context().Value(tokenIssuedAtKey).(time.Time)
	if !ok || iat.IsZero() {
		return false
	}
	if iat.After(now.Add(freshSessionClockSkew)) {
		return false
	}
	return now.Sub(iat) <= freshSessionMaxAge
}

func requireFreshSession(w http.ResponseWriter, r *http.Request) bool {
	if sessionIsFresh(r, time.Now()) {
		return true
	}
	http.Error(w, "Fresh sign-in required: request a new email code and try again", http.StatusForbidden)
	return false
}

func isNonEmptyBase64(s string) bool {
	if s == "" {
		return false
	}
	if _, err := base64.StdEncoding.DecodeString(s); err == nil {
		return true
	}
	_, err := base64.RawStdEncoding.DecodeString(s)
	return err == nil
}

// validateEncryptedVault checks that s is a JSON object with base64 salt, iv and ciphertext.
func validateEncryptedVault(s string) error {
	if len(s) == 0 || len(s) > maxEncryptedVaultBytes {
		return errors.New("encrypted_vault missing or too large")
	}
	var v struct {
		Salt       string `json:"salt"`
		IV         string `json:"iv"`
		Ciphertext string `json:"ciphertext"`
	}
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		return errors.New("encrypted_vault is not valid JSON")
	}
	if !isNonEmptyBase64(v.Salt) || !isNonEmptyBase64(v.IV) || !isNonEmptyBase64(v.Ciphertext) {
		return errors.New("encrypted_vault needs base64 salt, iv and ciphertext")
	}
	return nil
}

// validateRecoveryVault checks the envelope list shape {v:1, envelopes:[{kind, iv, ciphertext, ...}]}.
// Further fields per envelope (salt, kdf params, credential ids for later passkey envelopes) are allowed.
func validateRecoveryVault(s string) error {
	if len(s) == 0 || len(s) > maxRecoveryVaultBytes {
		return errors.New("recovery_vault missing or too large")
	}
	var v struct {
		V         int `json:"v"`
		Envelopes []struct {
			Kind       string `json:"kind"`
			IV         string `json:"iv"`
			Ciphertext string `json:"ciphertext"`
		} `json:"envelopes"`
	}
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		return errors.New("recovery_vault is not valid JSON")
	}
	if v.V != 1 {
		return errors.New("recovery_vault has an unsupported version")
	}
	if len(v.Envelopes) == 0 || len(v.Envelopes) > maxRecoveryEnvelopes {
		return fmt.Errorf("recovery_vault needs 1 to %d envelopes", maxRecoveryEnvelopes)
	}
	for _, e := range v.Envelopes {
		if !envelopeKindPattern.MatchString(e.Kind) {
			return errors.New("recovery_vault envelope has an invalid kind")
		}
		if !isNonEmptyBase64(e.IV) || !isNonEmptyBase64(e.Ciphertext) {
			return errors.New("recovery_vault envelope needs base64 iv and ciphertext")
		}
	}
	return nil
}

// keyProof is the answer to a key challenge (see auth_challenge.go), embedded in write requests.
type keyProof struct {
	ChallengeID       string `json:"challenge_id"`
	ChallengeResponse string `json:"challenge_response"`
}

func (h *AuthHandler) requireKeyProof(w http.ResponseWriter, userID string, p keyProof) bool {
	if err := h.consumeKeyProof(userID, p.ChallengeID, p.ChallengeResponse); err != nil {
		http.Error(w, "Key proof failed: request a new key challenge and answer it with your private key", http.StatusForbidden)
		return false
	}
	return true
}

func userIDFrom(r *http.Request) string {
	id, _ := r.Context().Value("user_id").(string)
	return id
}

// GetRecoveryVault returns the caller's own recovery vault. With ?status=1 only the existence flag.
func (h *AuthHandler) GetRecoveryVault(w http.ResponseWriter, r *http.Request) {
	userID := userIDFrom(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	vault, err := h.Store.GetRecoveryVault(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	resp := map[string]interface{}{"has_recovery": vault != ""}
	if r.URL.Query().Get("status") == "" {
		if vault != "" {
			resp["recovery_vault"] = vault
		} else {
			resp["recovery_vault"] = nil
		}
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(resp)
}

// PutRecoveryVault sets up or replaces the recovery vault (fresh session only).
func (h *AuthHandler) PutRecoveryVault(w http.ResponseWriter, r *http.Request) {
	userID := userIDFrom(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !requireFreshSession(w, r) {
		return
	}
	var req struct {
		RecoveryVault string `json:"recovery_vault"`
		keyProof
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRecoveryBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if err := validateRecoveryVault(req.RecoveryVault); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if !h.requireKeyProof(w, userID, req.keyProof) {
		return
	}
	if err := h.Store.SetRecoveryVault(r.Context(), userID, req.RecoveryVault); err != nil {
		log.Printf("PutRecoveryVault: store failed for user %s: %v", userID, err)
		http.Error(w, "Failed to store recovery vault", http.StatusInternalServerError)
		return
	}
	h.notifyVaultChange(userID, noticeRecoverySetup)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]bool{"has_recovery": true})
}

// ReplaceVault swaps encrypted_vault (fresh session only), keeping one previous generation.
func (h *AuthHandler) ReplaceVault(w http.ResponseWriter, r *http.Request) {
	userID := userIDFrom(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if !requireFreshSession(w, r) {
		return
	}
	var req struct {
		EncryptedVault string  `json:"encrypted_vault"`
		RecoveryVault  *string `json:"recovery_vault"`
		keyProof
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRecoveryBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	if err := validateEncryptedVault(req.EncryptedVault); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if req.RecoveryVault != nil {
		if strings.TrimSpace(*req.RecoveryVault) == "" {
			req.RecoveryVault = nil
		} else if err := validateRecoveryVault(*req.RecoveryVault); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
	}
	if !h.requireKeyProof(w, userID, req.keyProof) {
		return
	}
	err := h.Store.ReplaceEncryptedVault(r.Context(), userID, []byte(req.EncryptedVault), req.RecoveryVault, time.Now(), vaultReplaceCooldown)
	if errors.Is(err, store.ErrVaultReplaceCooldown) {
		http.Error(w, "The vault was already replaced within the last 24 hours; it can be replaced again after that", http.StatusTooManyRequests)
		return
	}
	if err != nil {
		log.Printf("ReplaceVault: store failed for user %s: %v", userID, err)
		http.Error(w, "Failed to replace vault", http.StatusInternalServerError)
		return
	}
	log.Printf("ReplaceVault: encrypted vault replaced for user %s", userID)
	h.notifyVaultChange(userID, noticeVaultReplaced)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}
