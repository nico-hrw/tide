package api

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type otpEntry struct {
	Code      string
	ExpiresAt time.Time
}

type AuthHandler struct {
	Store           *store.SQLiteStore
	ServerMasterKey []byte
	otpCache        map[string]otpEntry
	mu              sync.Mutex
}

func NewAuthHandler(s *store.SQLiteStore, masterKey []byte) *AuthHandler {
	return &AuthHandler{
		Store:           s,
		ServerMasterKey: masterKey,
		otpCache:        make(map[string]otpEntry),
	}
}

func (h *AuthHandler) RegisterRoutes(r chi.Router) {
	r.Post("/register", h.Register)
	r.Post("/request-otp", h.RequestOTP)
	r.Post("/verify-otp", h.VerifyOTP)
	
	// Legacy routes mapped or kept dummy if needed, omitting for now or keeping step1/step2
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

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Email == "" || req.PublicKey == "" || req.EncryptedVault == "" {
		log.Printf("REGISTRATION FAILED: Missing required fields. Email: %s, PubKey: %d chars, Vault: %d chars", 
			req.Email, len(req.PublicKey), len(req.EncryptedVault))
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

	pinHash := hashString(req.Pin)

	user := &db.User{
		ID:              uuid.New().String(),
		EmailHash:       emailHash,
		UsernameHash:    usernameHash,
		PhoneHash:       phoneHash,
		EncryptedVault:  []byte(req.EncryptedVault),
		EncryptedPepper: encryptedPepper,
		PublicKey:       req.PublicKey,
		PinHash:         &pinHash,
		CreatedAt:       time.Now(),
	}

	if err := h.Store.CreateUser(r.Context(), user); err != nil {
		log.Printf("REGISTRATION FAILED (Conflict?): %v", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "users.email_blind_index") {
			http.Error(w, "Email already registered", http.StatusConflict)
		} else {
			http.Error(w, fmt.Sprintf("User already exists or conflict: %v", err), http.StatusConflict)
		}
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": user.ID})
}

type OTPRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	var req OTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	emailHash := hashString(req.Email)
	user, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	
	// Prepare response
	resp := map[string]interface{}{
		"user_exists": false,
	}

	if err != nil {
		if err == store.ErrNotFound {
			// Not an error, just user_exists = false
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	resp["user_exists"] = true

	// Basic rate limiting / existing code check
	h.mu.Lock()
	if entry, exists := h.otpCache[user.ID]; exists && time.Now().Before(entry.ExpiresAt) {
		h.mu.Unlock()
		// Re-send or just tell them to wait - let's just generate a new one and overwrite for MVP simplicity
		// Or return early. For simplicity we overwrite.
	} else {
		h.mu.Unlock()
	}

	otpCode := uuid.New().String()[:6] // 6-digit alphanumeric
	h.mu.Lock()
	h.otpCache[user.ID] = otpEntry{
		Code:      otpCode,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	h.mu.Unlock()

	log.Printf("--------------------------------------------------")
	log.Printf("OTP for %s: %s", req.Email, otpCode)
	log.Printf("--------------------------------------------------")

	resp["message"] = "OTP sent successfully"
	resp["otp"] = otpCode // Temp for testing
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

type VerifyOTPRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

func (h *AuthHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var req VerifyOTPRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	emailHash := hashString(req.Email)
	user, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		log.Printf("VerifyOTP: Invalid credentials - user not found. Error: %v", err)
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
		return
	}

	h.mu.Lock()
	entry, exists := h.otpCache[user.ID]
	if !exists || time.Now().After(entry.ExpiresAt) || !strings.EqualFold(req.OTP, entry.Code) {
		h.mu.Unlock()
		log.Printf("VerifyOTP: Invalid or expired OTP. exists: %v, expired: %v, code_match: %v (req: %s, cache: %s)", exists, time.Now().After(entry.ExpiresAt), strings.EqualFold(req.OTP, entry.Code), req.OTP, entry.Code)
		http.Error(w, "Invalid or expired OTP", http.StatusUnauthorized)
		return
	}
	delete(h.otpCache, user.ID)
	h.mu.Unlock()

	// Decrypt Pepper
	block, err := aes.NewCipher(h.ServerMasterKey)
	if err != nil {
		http.Error(w, "Decryption setup failed", http.StatusInternalServerError)
		return
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		http.Error(w, "GCM setup failed", http.StatusInternalServerError)
		return
	}

	nonceSize := aesGCM.NonceSize()
	if len(user.EncryptedPepper) < nonceSize {
		http.Error(w, "Corrupted pepper data", http.StatusInternalServerError)
		return
	}

	nonce, ciphertext := user.EncryptedPepper[:nonceSize], user.EncryptedPepper[nonceSize:]
	pepper, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		log.Printf("VerifyOTP: Failed to decrypt pepper. Error: %v", err)
		http.Error(w, "Failed to decrypt pepper", http.StatusUnauthorized)
		return
	}
	log.Printf("VerifyOTP: Pepper successfully decrypted. Length: %d", len(pepper))

	// Generate JWT
	jwtKeyStr := os.Getenv("JWT_SECRET")
	if jwtKeyStr == "" {
		jwtKeyStr = "super-secret-jwt-key" // Fallback for dev
	}
	jwtKey := []byte(jwtKeyStr)
	claims := jwt.MapClaims{
		"sub": user.ID,
		"exp": time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := t.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Failed to generate JWT", http.StatusInternalServerError)
		return
	}

	// Set httpOnly cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "tide_session",
		Value:    tokenString,
		Expires:  time.Now().Add(7 * 24 * time.Hour),
		HttpOnly: true,
		Secure:   false, // Set true in production over HTTPS
		SameSite: http.SameSiteLaxMode,
		Path:     "/",
	})

	resp := map[string]interface{}{
		"token":           tokenString,
		"pepper":          base64.StdEncoding.EncodeToString(pepper),
		"encrypted_vault": string(user.EncryptedVault), // Sent back as string
		"user_id":         user.ID,
		"public_key":      user.PublicKey,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
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
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// Legacy auth code has been removed.


