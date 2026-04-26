package api

import (
	"bytes"
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
		Username:        req.Username,
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
		log.Printf("ERROR in RequestOTP (GetUserByEmailHash): %v for email %s", err, req.Email)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	resp["user_exists"] = true
	resp["username"] = user.Username // Return plaintext username for display

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

	// Send OTP via Resend
	if err := sendOTPEmail(req.Email, otpCode); err != nil {
		log.Printf("ERROR sending OTP email: %v", err)
		// We still return success to avoid user enumeration or giving away that email failed,
		// but in a real app you might want to handle this differently.
		// However, the user wants it implemented, so if it fails, it's a real issue.
		http.Error(w, "Failed to send OTP email", http.StatusInternalServerError)
		return
	}

	log.Printf("OTP sent via Resend to %s", req.Email)

	resp["message"] = "OTP sent successfully"
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(resp)
}

func sendOTPEmail(email, code string) error {
	apiKey := os.Getenv("RESEND_API_KEY")
	if apiKey == "" {
		return fmt.Errorf("RESEND_API_KEY not set")
	}

	url := "https://api.resend.com/emails"

	htmlContent := fmt.Sprintf(`
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 48px 24px; border-radius: 16px; background-color: #ffffff; color: #111827;">
            <div style="text-align: center; margin-bottom: 40px;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3b82f6 0%%, #8b5cf6 100%%); border-radius: 12px; margin: 0 auto 16px auto; display: flex; align-items: center; justify-content: center;">
                   <span style="color: white; font-size: 24px; font-weight: bold;">T</span>
                </div>
                <h1 style="font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.02em;">Verify your identity</h1>
            </div>
            
            <p style="font-size: 16px; line-height: 1.6; color: #4b5563; margin-bottom: 32px; text-align: center;">
                Enter the following code in Tide to complete your sign-in. This code is valid for 5 minutes.
            </p>
            
            <div style="text-align: center; background-color: #f3f4f6; padding: 32px; border-radius: 12px; margin-bottom: 32px;">
                <span style="font-family: 'SF Mono', SFMono-Regular, ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; font-size: 36px; font-weight: 700; letter-spacing: 0.2em; color: #111827; margin-left: 0.2em;">%s</span>
            </div>
            
            <p style="font-size: 14px; line-height: 1.5; color: #9ca3af; text-align: center; margin-bottom: 0;">
                If you did not request this code, you can safely ignore this email.
            </p>
            
            <div style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #f3f4f6; text-align: center;">
                <p style="font-size: 12px; color: #9ca3af; margin: 0;">
                    &copy; 2026 Tide. All rights reserved.
                </p>
            </div>
        </div>
    `, code)

	payload := map[string]interface{}{
		"from":    "Support <no-reply@go-tide.app>",
		"to":      []string{email},
		"subject": "Your Tide Verification Code",
		"html":    htmlContent,
	}

	jsonPayload, _ := json.Marshal(payload)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonPayload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("resend API error (%d): %s", resp.StatusCode, string(body))
	}

	return nil
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
	// [FIX MITTEL-1] JWT_SECRET is validated at startup (see main / middleware).
	// If we somehow reach this point without a key the token must not be issued.
	jwtKeyStr := os.Getenv("JWT_SECRET")
	if jwtKeyStr == "" {
		log.Printf("[SECURITY] JWT_SECRET is not set — refusing to issue token")
		http.Error(w, "Server misconfiguration", http.StatusInternalServerError)
		return
	}
	jwtKey := []byte(jwtKeyStr)
	claims := jwt.MapClaims{
		"sub": user.ID,
		"exp": time.Now().Add(14 * 24 * time.Hour).Unix(),
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
		Expires:  time.Now().Add(14 * 24 * time.Hour),
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
		"username":        user.Username,
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
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Username == "" {
		http.Error(w, "Username cannot be empty", http.StatusBadRequest)
		return
	}

	// Update in store
	if err := h.Store.UpdateUserUsername(r.Context(), userID, req.Username); err != nil {
		http.Error(w, "Failed to update username", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// Legacy auth code has been removed.


