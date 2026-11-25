package api

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

const maxOTPCacheSize = 10000

type otpEntry struct {
	Code      string
	ExpiresAt time.Time
}

type OTPRequest struct {
	Email string `json:"email"`
}

func (h *AuthHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	isProduction := strings.EqualFold(os.Getenv("ENV"), "production")

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
		log.Printf("ERROR in RequestOTP (GetUserByEmailHash): %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	resp["user_exists"] = true

	var otpBytes [3]byte
	if _, err := rand.Read(otpBytes[:]); err != nil {
		log.Printf("ERROR in RequestOTP (generating OTP): %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
	otpCode := hex.EncodeToString(otpBytes[:]) // 6-char lowercase hex

	now := time.Now()
	h.mu.Lock()
	if h.otpCache == nil {
		h.otpCache = make(map[string]otpEntry)
	}
	for id, entry := range h.otpCache {
		if now.After(entry.ExpiresAt) {
			delete(h.otpCache, id)
		}
	}
	if _, exists := h.otpCache[user.ID]; !exists {
		for len(h.otpCache) >= maxOTPCacheSize {
			var oldestID string
			var oldestExp time.Time
			first := true
			for id, entry := range h.otpCache {
				if first || entry.ExpiresAt.Before(oldestExp) {
					oldestID = id
					oldestExp = entry.ExpiresAt
					first = false
				}
			}
			if first {
				break
			}
			delete(h.otpCache, oldestID)
		}
	}
	h.otpCache[user.ID] = otpEntry{
		Code:      otpCode,
		ExpiresAt: now.Add(5 * time.Minute),
	}
	h.mu.Unlock()

	// Send OTP via Resend
	apiKey := os.Getenv("RESEND_API_KEY")

	if !isProduction {
		if apiKey == "" {
			log.Printf("[DEV] OTP for %s: %s", req.Email, otpCode)
			resp["message"] = "OTP generated in dev mode"
		} else if err := sendOTPEmail(req.Email, otpCode); err != nil {
			log.Printf("ERROR sending OTP email: %v", err)
			log.Printf("[DEV] OTP for %s: %s", req.Email, otpCode)
			resp["message"] = "OTP generated (mailer failed in dev)"
		} else {
			log.Printf("[DEV] OTP sent via Resend for user %s", user.ID)
			resp["message"] = "OTP sent successfully"
		}
	} else {
		// Production mode: never leak OTP in JSON, return 503 on mailer failure
		if apiKey == "" {
			log.Printf("ERROR: RESEND_API_KEY not configured in production")
			http.Error(w, "Email service unavailable", http.StatusServiceUnavailable)
			return
		}
		if err := sendOTPEmail(req.Email, otpCode); err != nil {
			log.Printf("ERROR sending OTP email: %v", err)
			http.Error(w, "Failed to send verification code", http.StatusServiceUnavailable)
			return
		}
		log.Printf("OTP sent via Resend for user %s", user.ID)
		resp["message"] = "OTP sent successfully"
	}

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

	client := &http.Client{Timeout: 10 * time.Second}
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
	Code  string `json:"code,omitempty"`
	Pin   string `json:"pin,omitempty"`
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

	if h.otpLimiter != nil {
		if locked, remaining := h.otpLimiter.IsLocked(user.ID); locked {
			http.Error(w, fmt.Sprintf("Too many failed attempts. Account temporarily locked for %d seconds", int(remaining.Seconds())), http.StatusTooManyRequests)
			return
		}
	}

	otpVal := req.OTP
	if otpVal == "" {
		otpVal = req.Code
	}

	h.mu.Lock()
	entry, exists := h.otpCache[user.ID]
	expired := !exists || time.Now().After(entry.ExpiresAt)
	codeMatch := exists && subtle.ConstantTimeCompare([]byte(strings.ToLower(otpVal)), []byte(strings.ToLower(entry.Code))) == 1
	if !exists || expired || !codeMatch {
		if exists && expired {
			delete(h.otpCache, user.ID)
		}
		h.mu.Unlock()
		if h.otpLimiter != nil {
			if locked, _ := h.otpLimiter.RecordFailure(user.ID); locked {
				h.mu.Lock()
				delete(h.otpCache, user.ID)
				h.mu.Unlock()
			}
		}
		log.Printf("VerifyOTP: Invalid or expired OTP for user %s (exists: %v, expired: %v, code_match: %v)", user.ID, exists, expired, codeMatch)
		http.Error(w, "Invalid or expired OTP", http.StatusUnauthorized)
		return
	}
	delete(h.otpCache, user.ID)
	h.mu.Unlock()
	if h.otpLimiter != nil {
		h.otpLimiter.RecordSuccess(user.ID)
	}

	// If PIN is provided during OTP verification, verify & migrate it
	if req.Pin != "" {
		lockKey := user.ID
		if h.pinLimiter != nil {
			if locked, remaining := h.pinLimiter.IsLocked(lockKey); locked {
				http.Error(w, fmt.Sprintf("Too many failed attempts. Account temporarily locked for %d seconds", int(remaining.Seconds())), http.StatusTooManyRequests)
				return
			}
		}

		if user.PinHash != nil && *user.PinHash != "" {
			if !h.verifyAndMigratePin(r.Context(), user.ID, req.Pin, *user.PinHash) {
				if h.pinLimiter != nil {
					h.pinLimiter.RecordFailure(lockKey)
				}
				http.Error(w, "Invalid PIN", http.StatusUnauthorized)
				return
			}
			if h.pinLimiter != nil {
				h.pinLimiter.RecordSuccess(lockKey)
			}
		} else {
			newHash, err := hashPinArgon2id(req.Pin)
			if err == nil {
				_ = h.Store.UpdateUserPin(r.Context(), user.ID, newHash)
			}
			if h.pinLimiter != nil {
				h.pinLimiter.RecordSuccess(lockKey)
			}
		}
	}

	resp, ok := h.issueSignIn(w, r, user, "VerifyOTP", authMethodOTP)
	if !ok {
		return
	}
	// Vault-change notices for this session go to the address just proven by the OTP (only kept in
	// memory). The app shows the last replacement time at sign-in as a fallback.
	h.rememberSessionEmail(user.ID, req.Email)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// issueSignIn decrypts the pepper, issues the session JWT (with iat) and cookie and returns the sign-in
// fields shared by verify-otp and the passkey login. On failure it has written the error response.
func (h *AuthHandler) issueSignIn(w http.ResponseWriter, r *http.Request, user *db.User, logTag, authMethod string) (map[string]interface{}, bool) {
	// Decrypt Pepper
	block, err := aes.NewCipher(h.ServerMasterKey)
	if err != nil {
		http.Error(w, "Decryption setup failed", http.StatusInternalServerError)
		return nil, false
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		http.Error(w, "GCM setup failed", http.StatusInternalServerError)
		return nil, false
	}

	nonceSize := aesGCM.NonceSize()
	if len(user.EncryptedPepper) < nonceSize {
		http.Error(w, "Corrupted pepper data", http.StatusInternalServerError)
		return nil, false
	}

	nonce, ciphertext := user.EncryptedPepper[:nonceSize], user.EncryptedPepper[nonceSize:]
	pepper, err := aesGCM.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		log.Printf("%s: Failed to decrypt pepper. Error: %v", logTag, err)
		http.Error(w, "Failed to decrypt pepper", http.StatusUnauthorized)
		return nil, false
	}
	log.Printf("%s: Pepper successfully decrypted. Length: %d", logTag, len(pepper))

	// Generate JWT
	// [FIX MITTEL-1] JWT_SECRET is validated at startup (see main / middleware).
	// If we somehow reach this point without a key the token must not be issued.
	jwtKeyStr := os.Getenv("JWT_SECRET")
	if jwtKeyStr == "" {
		log.Printf("[SECURITY] JWT_SECRET is not set — refusing to issue token")
		http.Error(w, "Server misconfiguration", http.StatusInternalServerError)
		return nil, false
	}
	jwtKey := []byte(jwtKeyStr)
	claims := jwt.MapClaims{
		"sub": user.ID,
		"iat": time.Now().Unix(), // lets vault-replacing endpoints require a fresh sign-in
		"auth": authMethod, // "otp" or "passkey"; vault changes need a mail-code session
		"exp": time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := t.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Failed to generate JWT", http.StatusInternalServerError)
		return nil, false
	}

	// Set httpOnly cookie
	isSecure := r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" || strings.EqualFold(os.Getenv("ENV"), "production")
	http.SetCookie(w, &http.Cookie{
		Name:     "tide_session",
		Value:    tokenString,
		Expires:  time.Now().Add(30 * 24 * time.Hour),
		HttpOnly: true,
		Secure:   isSecure,
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
	if replacedAt, err := h.Store.GetVaultReplacedAt(r.Context(), user.ID); err == nil && !replacedAt.IsZero() {
		resp["vault_replaced_at"] = replacedAt.UTC().Format(time.RFC3339)
	}

	return resp, true
}
