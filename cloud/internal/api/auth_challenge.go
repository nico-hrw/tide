package api

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Proof of key possession for vault-replacing endpoints.
//
// The server encrypts 32 random bytes to the user's stored public key (SPKI, base64) with RSA-OAEP
// SHA-256 (hash and MGF1 hash SHA-256, empty label: the parameters WebCrypto uses for the key made in
// web/src/lib/crypto.ts generateMasterKeys). Only the holder of the private key can return the
// plaintext. The server keeps just a SHA-256 of the plaintext, bound to user and challenge id, valid
// for keyChallengeTTL and consumed on the first answer (right or wrong).

const (
	keyChallengeTTL     = 2 * time.Minute
	keyChallengeBytes   = 32
	maxKeyChallenges    = 10000
	sessionEmailTTL     = 15 * time.Minute
	maxSessionEmailKeep = 10000
)

type keyChallenge struct {
	userID    string
	hash      [32]byte
	expiresAt time.Time
}

type sessionEmail struct {
	email     string
	expiresAt time.Time
}

var errKeyProof = errors.New("key proof failed")

func parseSPKIRSAPublicKey(spkiB64 string) (*rsa.PublicKey, error) {
	der, err := base64.StdEncoding.DecodeString(strings.TrimSpace(spkiB64))
	if err != nil {
		return nil, err
	}
	pub, err := x509.ParsePKIXPublicKey(der)
	if err != nil {
		return nil, err
	}
	rsaPub, ok := pub.(*rsa.PublicKey)
	if !ok {
		return nil, errors.New("public key is not RSA")
	}
	return rsaPub, nil
}

// KeyChallenge issues a one-time challenge encrypted to the caller's public key.
func (h *AuthHandler) KeyChallenge(w http.ResponseWriter, r *http.Request) {
	userID := userIDFrom(r)
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	user, err := h.Store.GetUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}
	pub, err := parseSPKIRSAPublicKey(user.PublicKey)
	if err != nil {
		log.Printf("KeyChallenge: unusable public key for user %s: %v", userID, err)
		http.Error(w, "Account key cannot be used for a key proof", http.StatusConflict)
		return
	}
	plain := make([]byte, keyChallengeBytes)
	if _, err := rand.Read(plain); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	ct, err := rsa.EncryptOAEP(sha256.New(), rand.Reader, pub, plain, nil)
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	id := uuid.New().String()
	now := time.Now()

	h.mu.Lock()
	if h.keyChallenges == nil {
		h.keyChallenges = make(map[string]keyChallenge)
	}
	for k, c := range h.keyChallenges {
		if now.After(c.expiresAt) {
			delete(h.keyChallenges, k)
		}
	}
	if len(h.keyChallenges) >= maxKeyChallenges {
		h.mu.Unlock()
		http.Error(w, "Too many open challenges, try again shortly", http.StatusServiceUnavailable)
		return
	}
	h.keyChallenges[id] = keyChallenge{userID: userID, hash: sha256.Sum256(plain), expiresAt: now.Add(keyChallengeTTL)}
	h.mu.Unlock()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"challenge_id": id,
		"challenge":    base64.StdEncoding.EncodeToString(ct),
	})
}

// consumeKeyProof checks and always consumes the challenge. responseB64 is the decrypted plaintext.
func (h *AuthHandler) consumeKeyProof(userID, challengeID, responseB64 string) error {
	h.mu.Lock()
	c, ok := h.keyChallenges[challengeID]
	if ok {
		delete(h.keyChallenges, challengeID)
	}
	h.mu.Unlock()
	if !ok || challengeID == "" || c.userID != userID || time.Now().After(c.expiresAt) {
		return errKeyProof
	}
	plain, err := base64.StdEncoding.DecodeString(responseB64)
	if err != nil {
		return errKeyProof
	}
	got := sha256.Sum256(plain)
	if subtle.ConstantTimeCompare(got[:], c.hash[:]) != 1 {
		return errKeyProof
	}
	return nil
}

// rememberSessionEmail keeps the address from a successful verify-otp briefly in memory, because the
// database only stores its blind index; security notices for that session go to it.
func (h *AuthHandler) rememberSessionEmail(userID, email string) {
	now := time.Now()
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.sessionEmails == nil {
		h.sessionEmails = make(map[string]sessionEmail)
	}
	for k, e := range h.sessionEmails {
		if now.After(e.expiresAt) {
			delete(h.sessionEmails, k)
		}
	}
	if _, exists := h.sessionEmails[userID]; !exists && len(h.sessionEmails) >= maxSessionEmailKeep {
		return
	}
	h.sessionEmails[userID] = sessionEmail{email: strings.TrimSpace(email), expiresAt: now.Add(sessionEmailTTL)}
}

func (h *AuthHandler) sessionEmailFor(userID string) string {
	h.mu.Lock()
	defer h.mu.Unlock()
	e, ok := h.sessionEmails[userID]
	if !ok || time.Now().After(e.expiresAt) {
		return ""
	}
	return e.email
}
