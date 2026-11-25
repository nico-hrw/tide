package api

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
	"golang.org/x/crypto/argon2"
)

type AuthHandler struct {
	Store           *store.SQLiteStore
	ServerMasterKey []byte
	pinLimiter      *FailedAttemptTracker
	otpLimiter      *FailedAttemptTracker
	otpCache        map[string]otpEntry
	mu              sync.Mutex
}

func NewAuthHandler(s *store.SQLiteStore, masterKey []byte) *AuthHandler {
	return &AuthHandler{
		Store:           s,
		ServerMasterKey: masterKey,
		pinLimiter:      NewFailedAttemptTracker(5, 15*time.Minute),
		otpLimiter:      NewFailedAttemptTracker(5, 15*time.Minute),
		otpCache:        make(map[string]otpEntry),
	}
}

func (h *AuthHandler) RegisterRoutes(r chi.Router) {
	r.Post("/register", h.Register)
	r.Post("/request-otp", h.RequestOTP)
	r.Post("/verify-otp", h.VerifyOTP)
	r.Post("/verify-pin", h.VerifyPin)
	r.Post("/login/step2", h.VerifyPin)
	r.Post("/auth/verify-pin", h.VerifyPin)
	r.Post("/auth/login/step2", h.VerifyPin)
	
	r.With(AuthMiddleware).Get("/me", h.Me)
	r.With(AuthMiddleware).Put("/me", h.UpdateMe)
}

// RegisterRequest payload
type RegisterRequest struct {
	Email          string `json:"email"`
	Username       string `json:"username"`
	Phone          string `json:"phone"`
	PublicKey      string `json:"public_key"`
	EncryptedVault string `json:"encrypted_vault"`
	Pepper         string `json:"pepper"` // Base64 or Hex, client generated
	Pin            string `json:"pin"`
}

func hashString(s string) string {
	h := sha256.Sum256([]byte(s))
	return hex.EncodeToString(h[:])
}

const (
	argon2Memory      = 64 * 1024 // 65536 KiB (m=65536)
	argon2Iterations  = 3         // t=3
	argon2Parallelism = 2         // p=2
	argon2SaltLength  = 16        // 16 bytes random salt
	argon2KeyLength   = 32        // 32 bytes derived key
)

// hashPinArgon2id hashes a PIN using Argon2id with a 16-byte random salt.
// Format: $argon2id$v=19$m=65536,t=3,p=2$<salt_b64>$<hash_b64>
func hashPinArgon2id(pin string) (string, error) {
	salt := make([]byte, argon2SaltLength)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return "", fmt.Errorf("failed to generate random salt: %w", err)
	}

	hash := argon2.IDKey([]byte(pin), salt, argon2Iterations, argon2Memory, argon2Parallelism, argon2KeyLength)

	saltB64 := base64.RawStdEncoding.EncodeToString(salt)
	hashB64 := base64.RawStdEncoding.EncodeToString(hash)

	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s", argon2.Version, argon2Memory, argon2Iterations, argon2Parallelism, saltB64, hashB64), nil
}

func decodeBase64(s string) ([]byte, error) {
	if b, err := base64.RawStdEncoding.DecodeString(s); err == nil {
		return b, nil
	}
	return base64.StdEncoding.DecodeString(s)
}

// verifyArgon2idPin verifies an input PIN against an Argon2id formatted hash.
func verifyArgon2idPin(pin, storedHash string) (bool, error) {
	parts := strings.Split(storedHash, "$")
	if len(parts) != 6 {
		return false, fmt.Errorf("invalid argon2id hash format")
	}
	if parts[1] != "argon2id" {
		return false, fmt.Errorf("unsupported argon2 variant")
	}

	var memory uint32 = argon2Memory
	var iterations uint32 = argon2Iterations
	var parallelism uint8 = argon2Parallelism

	for _, param := range strings.Split(parts[3], ",") {
		kv := strings.SplitN(param, "=", 2)
		if len(kv) != 2 {
			return false, fmt.Errorf("malformed argon2id parameter")
		}
		switch kv[0] {
		case "m":
			var m uint32
			if _, err := fmt.Sscanf(kv[1], "%d", &m); err != nil {
				return false, fmt.Errorf("invalid argon2id memory parameter: %w", err)
			}
			memory = m
		case "t":
			var t uint32
			if _, err := fmt.Sscanf(kv[1], "%d", &t); err != nil {
				return false, fmt.Errorf("invalid argon2id iterations parameter: %w", err)
			}
			iterations = t
		case "p":
			var p uint8
			if _, err := fmt.Sscanf(kv[1], "%d", &p); err != nil {
				return false, fmt.Errorf("invalid argon2id parallelism parameter: %w", err)
			}
			parallelism = p
		}
	}

	if iterations < 1 || iterations > 100 || memory < 1024 || memory > 1024*1024 || parallelism < 1 || parallelism > 64 {
		return false, fmt.Errorf("argon2id parameters out of allowed bounds")
	}

	salt, err := decodeBase64(parts[4])
	if err != nil || len(salt) == 0 {
		return false, fmt.Errorf("invalid argon2id salt")
	}

	expectedHash, err := decodeBase64(parts[5])
	if err != nil || len(expectedHash) == 0 {
		return false, fmt.Errorf("invalid argon2id hash")
	}

	computedHash := argon2.IDKey([]byte(pin), salt, iterations, memory, parallelism, uint32(len(expectedHash)))
	return subtle.ConstantTimeCompare(computedHash, expectedHash) == 1, nil
}

// verifyAndMigratePin verifies the PIN against storedHash.
// If storedHash starts with $argon2id$, it verifies using Argon2id with constant-time compare.
// If storedHash is a legacy 64-char hex SHA-256, it verifies against legacy SHA-256 using subtle.ConstantTimeCompare.
// If valid, it transparently re-hashes with Argon2id and updates the user's PIN in the database.
func (h *AuthHandler) verifyAndMigratePin(ctx context.Context, userID, pin, storedHash string) bool {
	if strings.HasPrefix(storedHash, "$argon2id$") {
		ok, err := verifyArgon2idPin(pin, storedHash)
		if err != nil {
			log.Printf("PIN verification failed due to invalid Argon2id hash: %v", err)
			return false
		}
		return ok
	}

	// Legacy 64-char hex SHA-256 verify
	legacyHash := hashString(pin)
	if subtle.ConstantTimeCompare([]byte(strings.ToLower(legacyHash)), []byte(strings.ToLower(storedHash))) == 1 {
		// Migrate to Argon2id transparently
		if newHash, err := hashPinArgon2id(pin); err == nil && userID != "" && h.Store != nil {
			if err := h.Store.UpdateUserPin(ctx, userID, newHash); err != nil {
				log.Printf("Failed to transparently update PIN hash for user %s: %v", userID, err)
			} else {
				log.Printf("Migrated legacy PIN hash to Argon2id for user %s", userID)
			}
		}
		return true
	}

	return false
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.PublicKey == "" || req.EncryptedVault == "" {
		log.Printf("REGISTRATION FAILED: Missing required fields. HasEmail: %t, PubKey: %d chars, Vault: %d chars",
			req.Email != "", len(req.PublicKey), len(req.EncryptedVault))
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}
	// Prepare Blind Indexes
	var emailHash, usernameHash, phoneHash *string

	if req.Email != "" {
		h := hashString(req.Email)
		emailHash = &h
	}
	if req.Username != "" {
		h := hashString(req.Username)
		usernameHash = &h
	}
	if req.Phone != "" && req.Phone != "000000000" {
		h := hashString(req.Phone)
		phoneHash = &h
	}

	// Decode client-provided pepper
	pepper, err := base64.StdEncoding.DecodeString(req.Pepper)
	if err != nil || len(pepper) == 0 {
		// Fallback to hex if base64 fails
		pepper, err = hex.DecodeString(req.Pepper)
		if err != nil || len(pepper) == 0 {
			http.Error(w, "Invalid pepper format", http.StatusBadRequest)
			return
		}
	}

	// Encrypt pepper with SERVER_MASTER_KEY using AES-GCM
	block, err := aes.NewCipher(h.ServerMasterKey)
	if err != nil {
		http.Error(w, "Encryption setup failed", http.StatusInternalServerError)
		return
	}

	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		http.Error(w, "GCM setup failed", http.StatusInternalServerError)
		return
	}

	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		http.Error(w, "Nonce generation failed", http.StatusInternalServerError)
		return
	}

	encryptedPepper := aesGCM.Seal(nonce, nonce, pepper, nil)

	// The vault PIN is a client-side secret: the web app never sends it. A PIN hash is stored
	// only when a client explicitly provides one; steps that verify it fail closed otherwise.
	var pinHash *string
	if strings.TrimSpace(req.Pin) != "" {
		hashed, err := hashPinArgon2id(req.Pin)
		if err != nil {
			http.Error(w, "PIN hashing failed", http.StatusInternalServerError)
			return
		}
		pinHash = &hashed
	}

	user := &db.User{
		ID:              uuid.New().String(),
		EmailHash:       emailHash,
		UsernameHash:    usernameHash,
		PhoneHash:       phoneHash,
		EncryptedVault:  []byte(req.EncryptedVault),
		EncryptedPepper: encryptedPepper,
		PublicKey:       req.PublicKey,
		PinHash:         pinHash,
		CreatedAt:       time.Now(),
		Username:        req.Username,
	}

	if err := h.Store.CreateUser(r.Context(), user); err != nil {
		log.Printf("REGISTRATION FAILED (Conflict?): %v", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "users.email_blind_index") {
			http.Error(w, "Email already registered", http.StatusConflict)
		} else {
			http.Error(w, "User already exists or conflict", http.StatusConflict)
		}
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": user.ID})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.Store.GetUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	resp := map[string]interface{}{
		"id":         user.ID,
		"public_key": user.PublicKey,
		"username":   user.Username,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req struct {
		Username string `json:"username"`
		Email    string `json:"email"`
		PIN      string `json:"pin"`
		NewPIN   string `json:"new_pin"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// 1. Handle Username update
	if req.Username != "" {
		if err := h.Store.UpdateUserUsername(r.Context(), userID, req.Username); err != nil {
			http.Error(w, "Failed to update username", http.StatusInternalServerError)
			return
		}
	}

	// 2. Handle Email update (requires PIN)
	if req.Email != "" {
		if req.PIN == "" {
			http.Error(w, "PIN required to change email", http.StatusForbidden)
			return
		}

		user, err := h.Store.GetUser(r.Context(), userID)
		if err != nil {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		pinHash := ""
		if user.PinHash != nil {
			pinHash = *user.PinHash
		}
		if !h.verifyPinWithLimiter(r.Context(), w, user.ID, req.PIN, pinHash) {
			return
		}

		emailHash := hashString(req.Email)
		if err := h.Store.UpdateUserEmail(r.Context(), userID, emailHash); err != nil {
			if strings.Contains(err.Error(), "UNIQUE constraint") {
				http.Error(w, "Email already in use", http.StatusConflict)
			} else {
				http.Error(w, "Failed to update email", http.StatusInternalServerError)
			}
			return
		}
	}

	// 3. Handle PIN update (always stores Argon2id)
	if req.NewPIN != "" {
		user, err := h.Store.GetUser(r.Context(), userID)
		if err != nil {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}

		// A session alone must never enrol the first PIN hash: with one, step-up checks such as the
		// email change could be passed by whoever holds only a stolen session. Accounts without a
		// PIN hash therefore cannot set one here.
		if user.PinHash == nil || *user.PinHash == "" {
			http.Error(w, "PIN cannot be set without re-authentication", http.StatusForbidden)
			return
		}
		if req.PIN == "" {
			http.Error(w, "Current PIN required to change PIN", http.StatusForbidden)
			return
		}
		if !h.verifyPinWithLimiter(r.Context(), w, user.ID, req.PIN, *user.PinHash) {
			return
		}

		newHash, err := hashPinArgon2id(req.NewPIN)
		if err != nil {
			http.Error(w, "Failed to hash new PIN", http.StatusInternalServerError)
			return
		}
		if err := h.Store.UpdateUserPin(r.Context(), userID, newHash); err != nil {
			http.Error(w, "Failed to update PIN", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusOK)
}

func (h *AuthHandler) verifyPinWithLimiter(ctx context.Context, w http.ResponseWriter, userID, pin, storedHash string) bool {
	if h.pinLimiter != nil {
		if locked, remaining := h.pinLimiter.IsLocked(userID); locked {
			http.Error(w, fmt.Sprintf("Too many failed attempts. Account temporarily locked for %d seconds", int(remaining.Seconds())), http.StatusTooManyRequests)
			return false
		}
	}

	if storedHash == "" || !h.verifyAndMigratePin(ctx, userID, pin, storedHash) {
		if h.pinLimiter != nil {
			h.pinLimiter.RecordFailure(userID)
		}
		http.Error(w, "Invalid PIN", http.StatusUnauthorized)
		return false
	}

	if h.pinLimiter != nil {
		h.pinLimiter.RecordSuccess(userID)
	}
	return true
}

// VerifyPinRequest for PIN verification during login or step-up
type VerifyPinRequest struct {
	Email string `json:"email"`
	Pin   string `json:"pin"`
}

func (h *AuthHandler) VerifyPin(w http.ResponseWriter, r *http.Request) {
	var req VerifyPinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	emailHash := hashString(req.Email)
	user, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if user.PinHash == nil || *user.PinHash == "" {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	if !h.verifyPinWithLimiter(r.Context(), w, user.ID, req.Pin, *user.PinHash) {
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "PIN verified successfully",
	})
}

// Legacy auth code has been removed.


