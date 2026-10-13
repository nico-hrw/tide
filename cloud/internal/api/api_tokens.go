package api

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

// SupportedScopes defines the valid scopes an API token can have
var SupportedScopes = map[string]string{
	"events:read":  "Termine abfragen (Leserechte)",
	"events:write": "Termine erstellen & bearbeiten (Schreibrechte)",
	"notes:read":   "Notizen abfragen (Leserechte)",
	"notes:write":  "Notizen erstellen & bearbeiten (Schreibrechte)",
}

type APITokenHandler struct {
	Store *store.SQLiteStore
}

func NewAPITokenHandler(s *store.SQLiteStore) *APITokenHandler {
	return &APITokenHandler{Store: s}
}

func (h *APITokenHandler) RegisterRoutes(r chi.Router) {
	r.Use(AuthMiddleware) // User must be logged in to manage tokens

	r.Get("/", h.ListTokens)
	r.Post("/", h.CreateToken)
	r.Delete("/{tokenID}", h.DeleteToken)
	r.Get("/scopes", h.ListScopes)
}

type CreateAPITokenRequest struct {
	Name          string   `json:"name"`
	Scopes        []string `json:"scopes"`
	ExpiresInDays int      `json:"expires_in_days"` // 0 or omitted for no expiry
}

type CreateAPITokenResponse struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	Token       string     `json:"token"` // Only shown once upon creation
	TokenPrefix string     `json:"token_prefix"`
	Scopes      []string   `json:"scopes"`
	CreatedAt   time.Time  `json:"created_at"`
	ExpiresAt   *time.Time `json:"expires_at"`
}

func (h *APITokenHandler) ListScopes(w http.ResponseWriter, r *http.Request) {
	type ScopeItem struct {
		Key         string `json:"key"`
		Description string `json:"description"`
		Implemented bool   `json:"implemented"`
	}

	scopes := []ScopeItem{
		{Key: "events:read", Description: SupportedScopes["events:read"], Implemented: true},
		{Key: "events:write", Description: SupportedScopes["events:write"], Implemented: false},
		{Key: "notes:read", Description: SupportedScopes["notes:read"], Implemented: false},
		{Key: "notes:write", Description: SupportedScopes["notes:write"], Implemented: false},
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(scopes)
}

func (h *APITokenHandler) ListTokens(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	tokens, err := h.Store.ListAPITokensForUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to list API tokens", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tokens)
}

func (h *APITokenHandler) CreateToken(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateAPITokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		http.Error(w, "Token name is required", http.StatusBadRequest)
		return
	}
	if len(name) > 100 {
		http.Error(w, "Token name cannot exceed 100 characters", http.StatusBadRequest)
		return
	}

	// Validate scopes
	var validScopes []string
	for _, sc := range req.Scopes {
		sc = strings.TrimSpace(sc)
		if _, exists := SupportedScopes[sc]; exists {
			validScopes = append(validScopes, sc)
		}
	}
	if len(validScopes) == 0 {
		http.Error(w, "At least one valid scope must be selected", http.StatusBadRequest)
		return
	}

	// Generate cryptographically secure token: "tide_pat_" + 32 random bytes in hex (64 chars)
	randomBytes := make([]byte, 32)
	if _, err := rand.Read(randomBytes); err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}
	rawHex := hex.EncodeToString(randomBytes)
	fullToken := "tide_pat_" + rawHex
	tokenPrefix := "tide_pat_" + rawHex[:8] + "..."

	// Compute SHA-256 hash
	hashBytes := sha256.Sum256([]byte(fullToken))
	tokenHash := hex.EncodeToString(hashBytes[:])

	var expiresAt *time.Time
	if req.ExpiresInDays > 0 {
		exp := time.Now().AddDate(0, 0, req.ExpiresInDays)
		expiresAt = &exp
	}

	tokenID := uuid.New().String()
	tokenModel := &db.APIToken{
		ID:          tokenID,
		UserID:      userID,
		Name:        name,
		TokenHash:   tokenHash,
		TokenPrefix: tokenPrefix,
		Scopes:      validScopes,
		CreatedAt:   time.Now(),
		ExpiresAt:   expiresAt,
		LastUsedAt:  nil,
	}

	if err := h.Store.CreateAPIToken(r.Context(), tokenModel); err != nil {
		http.Error(w, "Failed to save API token", http.StatusInternalServerError)
		return
	}

	resp := CreateAPITokenResponse{
		ID:          tokenID,
		Name:        name,
		Token:       fullToken,
		TokenPrefix: tokenPrefix,
		Scopes:      validScopes,
		CreatedAt:   tokenModel.CreatedAt,
		ExpiresAt:   expiresAt,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

func (h *APITokenHandler) DeleteToken(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	tokenID := chi.URLParam(r, "tokenID")
	if tokenID == "" {
		http.Error(w, "Missing token ID", http.StatusBadRequest)
		return
	}

	if err := h.Store.DeleteAPIToken(r.Context(), tokenID, userID); err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Token not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete token", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Token revoked successfully"}`))
}
