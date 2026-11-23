package api

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
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
)

// DevLoginRequest specifies input parameters for development authentication.
type DevLoginRequest struct {
	Type           string `json:"type"` // "disposable" or "persistent"
	Username       string `json:"username,omitempty"`
	PublicKey      string `json:"public_key,omitempty"`
	EncryptedVault string `json:"encrypted_vault,omitempty"`
	PinHash        string `json:"pin_hash,omitempty"`
	Pepper         string `json:"pepper,omitempty"`
}

// DevLoginResponse represents response data for dev authentication.
type DevLoginResponse struct {
	Token          string `json:"token,omitempty"`
	Pepper         string `json:"pepper,omitempty"`
	EncryptedVault string `json:"encrypted_vault,omitempty"`
	UserID         string `json:"user_id,omitempty"`
	PublicKey      string `json:"public_key,omitempty"`
	Username       string `json:"username,omitempty"`
	DevPin         string `json:"dev_pin,omitempty"`
	NeedsKeys      bool   `json:"needs_keys,omitempty"`
}

// DevLogin provides quick development login endpoints that bypass OTP and manual PIN entry.
func (h *AuthHandler) DevLogin(w http.ResponseWriter, r *http.Request) {
	if strings.EqualFold(os.Getenv("ENV"), "production") || !strings.EqualFold(os.Getenv("DEV_MODE"), "true") {
		http.Error(w, "Dev login is disabled", http.StatusForbidden)
		return
	}

	var req DevLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Type == "" {
		req.Type = "persistent"
	}

	// Persistent user lookup
	if req.Type == "persistent" {
		username := strings.TrimSpace(req.Username)
		if username == "" {
			username = "Dev Alice"
		}
		email := strings.ToLower(username) + "@dev.local"
		emailHash := hashString(email)

		user, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
		if err == nil && user != nil {
			pepper, err := h.decryptPepper(user.EncryptedPepper)
			if err != nil {
				http.Error(w, "Failed to decrypt pepper", http.StatusInternalServerError)
				return
			}

			tokenString, err := h.issueDevTokenAndCookie(w, r, user.ID)
			if err != nil {
				http.Error(w, "Failed to generate JWT", http.StatusInternalServerError)
				return
			}

			resp := DevLoginResponse{
				Token:          tokenString,
				Pepper:         base64.StdEncoding.EncodeToString(pepper),
				EncryptedVault: string(user.EncryptedVault),
				UserID:         user.ID,
				PublicKey:      user.PublicKey,
				Username:       user.Username,
				DevPin:         "000000",
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(resp)
			return
		}
	}

	// User does not exist or disposable requested -> Provision new user
	var userID, username, email string

	if req.Type == "disposable" {
		randBytes := make([]byte, 4)
		if _, err := io.ReadFull(rand.Reader, randBytes); err != nil {
			http.Error(w, "Failed to generate random ID", http.StatusInternalServerError)
			return
		}
		hexID := hex.EncodeToString(randBytes)
		userID = "user-temp-" + hexID

		var num [2]byte
		_, _ = io.ReadFull(rand.Reader, num[:])
		gastNum := 1000 + int(num[0])%9000
		username = fmt.Sprintf("Gast-%04d", gastNum)
		if strings.TrimSpace(req.Username) != "" {
			username = strings.TrimSpace(req.Username)
		}
		email = fmt.Sprintf("disposable-%s@dev.local", hexID)
	} else {
		username = strings.TrimSpace(req.Username)
		if username == "" {
			username = "Dev Alice"
		}
		slug := strings.ToLower(username)
		slug = strings.Map(func(r rune) rune {
			if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
				return r
			}
			return '-'
		}, slug)
		slug = strings.Trim(slug, "-")
		if slug == "" {
			slug = "alice"
		}
		userID = "dev-user-" + slug
		email = strings.ToLower(username) + "@dev.local"
	}

	// Generate or decode pepper
	var pepper []byte
	if req.Pepper != "" {
		if p, err := base64.StdEncoding.DecodeString(req.Pepper); err == nil && len(p) > 0 {
			pepper = p
		} else if p, err := hex.DecodeString(req.Pepper); err == nil && len(p) > 0 {
			pepper = p
		}
	}
	if len(pepper) == 0 {
		pepper = make([]byte, 32)
		if _, err := io.ReadFull(rand.Reader, pepper); err != nil {
			http.Error(w, "Failed to generate pepper", http.StatusInternalServerError)
			return
		}
	}

	encryptedPepper, err := h.encryptPepper(pepper)
	if err != nil {
		http.Error(w, "Failed to encrypt pepper", http.StatusInternalServerError)
		return
	}

	// Vault and public key:
	// If client provided req.EncryptedVault and req.PublicKey: use them.
	// Otherwise, return needs_keys so client can generate them with dev pin 000000 and submit.
	if req.EncryptedVault == "" || req.PublicKey == "" {
		resp := DevLoginResponse{
			NeedsKeys: true,
			Pepper:    base64.StdEncoding.EncodeToString(pepper),
			UserID:    userID,
			DevPin:    "000000",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	emailHash := hashString(email)
	usernameHash := hashString(username)

	pinHash := req.PinHash
	if pinHash == "" {
		if ph, err := hashPinArgon2id("000000"); err == nil {
			pinHash = ph
		}
	}

	newUser := &db.User{
		ID:              userID,
		EmailHash:       &emailHash,
		UsernameHash:    &usernameHash,
		EncryptedVault:  []byte(req.EncryptedVault),
		EncryptedPepper: encryptedPepper,
		PublicKey:       req.PublicKey,
		PinHash:         &pinHash,
		CreatedAt:       time.Now(),
		Username:        username,
		IsVerified:      true,
	}

	if err := h.Store.CreateUser(r.Context(), newUser); err != nil {
		// If user conflict occurred, attempt to load existing user
		existingUser, getErr := h.Store.GetUser(r.Context(), userID)
		if getErr == nil && existingUser != nil {
			newUser = existingUser
		} else {
			log.Printf("DevLogin: Failed to create dev user: %v (getErr: %v)", err, getErr)
			http.Error(w, "Failed to create dev user", http.StatusInternalServerError)
			return
		}
	}

	tokenString, err := h.issueDevTokenAndCookie(w, r, newUser.ID)
	if err != nil {
		log.Printf("DevLogin: Failed to issue token: %v", err)
		http.Error(w, "Failed to issue token", http.StatusInternalServerError)
		return
	}

	resp := DevLoginResponse{
		Token:          tokenString,
		Pepper:         base64.StdEncoding.EncodeToString(pepper),
		EncryptedVault: string(newUser.EncryptedVault),
		UserID:         newUser.ID,
		PublicKey:      newUser.PublicKey,
		Username:       newUser.Username,
		DevPin:         "000000",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *AuthHandler) encryptPepper(pepper []byte) ([]byte, error) {
	block, err := aes.NewCipher(h.ServerMasterKey)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return aesGCM.Seal(nonce, nonce, pepper, nil), nil
}

func (h *AuthHandler) decryptPepper(encrypted []byte) ([]byte, error) {
	block, err := aes.NewCipher(h.ServerMasterKey)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := aesGCM.NonceSize()
	if len(encrypted) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := encrypted[:nonceSize], encrypted[nonceSize:]
	return aesGCM.Open(nil, nonce, ciphertext, nil)
}

func (h *AuthHandler) issueDevTokenAndCookie(w http.ResponseWriter, r *http.Request, userID string) (string, error) {
	jwtKeyStr := os.Getenv("JWT_SECRET")
	if jwtKeyStr == "" {
		return "", fmt.Errorf("JWT_SECRET is not configured")
	}

	claims := jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(30 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(jwtKeyStr))
	if err != nil {
		return "", err
	}

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

	return tokenString, nil
}
