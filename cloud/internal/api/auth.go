package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type AuthHandler struct {
	Store *store.SQLiteStore
}

func NewAuthHandler(s *store.SQLiteStore) *AuthHandler {
	return &AuthHandler{Store: s}
}

func (h *AuthHandler) RegisterRoutes(r chi.Router) {
	r.Post("/register", h.Register)
	r.Post("/login/step1", h.LoginStep1)
	r.Post("/login/step2", h.VerifyPin)
	r.Post("/login/step3", h.VerifyCode)
	r.Get("/verify", h.Verify) // Legacy magic link verify for backward compatibility if needed
}

// RegisterRequest payload
type RegisterRequest struct {
	Email         string `json:"email"`
	Username      string `json:"username"`
	Phone         string `json:"phone"`
	PublicKey     string `json:"public_key"`
	EncPrivateKey string `json:"enc_private_key"`
	Pin           string `json:"pin"` // 5-digit PIN
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

	if req.Email == "" || req.PublicKey == "" || req.EncPrivateKey == "" {
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

	// Simulate "Encryption" of sensitive data for the encrypted_data blob
	// In real life, this is done by client or using a KMS.
	// Here we just JSON encode and pretend it's encrypted bytes.
	sensitiveData := map[string]string{
		"email":      req.Email,
		"username":   req.Username,
		"phone":      req.Phone,
		"master_key": req.EncPrivateKey,
	}
	encDataBytes, _ := json.Marshal(sensitiveData)

	pinHash := hashString(req.Pin)

	user := &db.User{
		ID:            uuid.New().String(),
		EmailHash:     emailHash,
		UsernameHash:  usernameHash,
		PhoneHash:     phoneHash,
		EncryptedData: encDataBytes,
		PublicKey:     req.PublicKey,
		PinHash:       &pinHash,
		CreatedAt:     time.Now(),
	}

	if err := h.Store.CreateUser(r.Context(), user); err != nil {
		log.Printf("REGISTRATION FAILED (Conflict?): %v", err)
		errMsg := err.Error()
		if strings.Contains(errMsg, "users.username_blind_index") {
			http.Error(w, "Username already taken", http.StatusConflict)
		} else if strings.Contains(errMsg, "users.email_blind_index") {
			http.Error(w, "Email already registered", http.StatusConflict)
		} else {
			http.Error(w, fmt.Sprintf("User already exists or conflict: %v", err), http.StatusConflict)
		}
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": user.ID})
}

type LoginRequest struct {
	Email string `json:"email"`
}

// LoginStep1 (Identifier verification)
func (h *AuthHandler) LoginStep1(w http.ResponseWriter, r *http.Request) {
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	emailHash := hashString(req.Email)
	user, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message": "User found, proceed to PIN entry",
		"id":      user.ID,
	})
}

// LoginStep2: Verify 5-digit PIN -> Send Alphanumeric Code
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

	if user.PinHash == nil {
		// Legacy user has no PIN - set it now!
		newPinHash := hashString(req.Pin)
		if err := h.Store.UpdateUserPin(r.Context(), user.ID, newPinHash); err != nil {
			http.Error(w, "Failed to set PIN for legacy user", http.StatusInternalServerError)
			return
		}
		user.PinHash = &newPinHash
	} else if hashString(req.Pin) != *user.PinHash {
		http.Error(w, "Invalid PIN", http.StatusUnauthorized)
		return
	}

	// Generate 6-char alphanumeric code (Simulated)
	code := uuid.New().String()[:6]
	if err := h.Store.SetLoginCode(r.Context(), user.ID, code); err != nil {
		http.Error(w, "Failed to generate login code", http.StatusInternalServerError)
		return
	}

	// Simulation: Notification via Website (returned in response for now)
	log.Printf("NOTIFICATION for %s: Your Login-Code is %s", req.Email, code)

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]string{
		"message":    "PIN verified. Login-Code sent via notification.",
		"login_code": code, // Returning for simulation as requested
	})
}

// LoginStep3: Verify Alphanumeric Code -> Return JWT
type VerifyCodeRequest struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

func (h *AuthHandler) VerifyCode(w http.ResponseWriter, r *http.Request) {
	var req VerifyCodeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	emailHash := hashString(req.Email)
	user, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		http.Error(w, "Invalid session", http.StatusUnauthorized)
		return
	}

	if user.LoginCode == nil || !strings.EqualFold(req.Code, *user.LoginCode) {
		http.Error(w, "Invalid code", http.StatusUnauthorized)
		return
	}

	// Invalidate code after use
	_ = h.Store.SetLoginCode(r.Context(), user.ID, "")

	// Generate session response (Reuse Verify logic basically)
	h.generateSession(w, user)
}

func (h *AuthHandler) generateSession(w http.ResponseWriter, user *db.User) {
	// Decrypt sensitive data to get master key (Simulation)
	var sensitiveData map[string]string
	if err := json.Unmarshal(user.EncryptedData, &sensitiveData); err != nil {
		http.Error(w, "Data corruption", http.StatusInternalServerError)
		return
	}

	jwtKey := []byte("super-secret-jwt-key")
	claims := jwt.MapClaims{
		"sub": user.ID,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := t.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Failed to generate JWT", http.StatusInternalServerError)
		return
	}

	resp := map[string]string{
		"session_token":   tokenString,
		"enc_private_key": sensitiveData["master_key"],
		"user_id":         user.ID,
		"email":           sensitiveData["email"],
		"username":        sensitiveData["username"],
		"public_key":      user.PublicKey,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	// Deprecated, use Step 1
	h.LoginStep1(w, r)
}

func (h *AuthHandler) Verify(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Missing token", http.StatusBadRequest)
		return
	}

	userID, err := h.Store.GetToken(r.Context(), token)
	if err != nil {
		http.Error(w, "Invalid or expired token", http.StatusUnauthorized)
		return
	}

	// Invalidate token (one-time use)
	h.Store.DeleteToken(r.Context(), token)

	// Get User Details to extract EncPrivateKey from EncryptedData
	user, err := h.Store.GetUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusInternalServerError)
		return
	}

	// Decrypt sensitive data to get master key (Simulation)
	var sensitiveData map[string]string
	if err := json.Unmarshal(user.EncryptedData, &sensitiveData); err != nil {
		http.Error(w, "Data corruption", http.StatusInternalServerError)
		return
	}

	// Generate JWT
	// Key should come from env var, hardcoded for MVP
	jwtKey := []byte("super-secret-jwt-key")
	claims := jwt.MapClaims{
		"sub": userID,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := t.SignedString(jwtKey)
	if err != nil {
		http.Error(w, "Failed to generate JWT", http.StatusInternalServerError)
		return
	}

	resp := map[string]string{
		"session_token":   tokenString,
		"enc_private_key": sensitiveData["master_key"],
		"user_id":         user.ID,
		"email":           sensitiveData["email"],
		"username":        sensitiveData["username"], // In real app, might just return ID/Pub data
		"public_key":      user.PublicKey,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}
