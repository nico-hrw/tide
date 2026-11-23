package api

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

const ScopeStorageExpand = "storage:expand"

// SupportedScopes defines the valid scopes an API token can have
var SupportedScopes = map[string]string{
	"events:read":      "Termine abfragen (Leserechte)",
	"events:write":     "Termine erstellen, bearbeiten & löschen (Schreibrechte)",
	"notes:read":       "Notizen abfragen (Leserechte)",
	"notes:write":      "Notizen erstellen, bearbeiten & löschen (Schreibrechte)",
	ScopeStorageExpand: "Upload-Speicher Erweiterung (>250MB)",
	"todos:read":       "Aufgaben abfragen & filtern (Leserechte)",
	"todos:write":      "Aufgaben verwalten (Erstellen, Bearbeiten, Löschen)",
	"todos:create":     "Aufgaben erstellen",
	"todos:edit":       "Aufgaben bearbeiten & Status ändern",
	"todos:delete":     "Aufgaben löschen",
	"folders:read":     "Ordner abfragen (Leserechte)",
	"folders:write":    "Ordner erstellen, bearbeiten & löschen (Schreibrechte)",
	"tags:read":        "Tags abfragen (Leserechte)",
	"tags:write":       "Tags erstellen, bearbeiten & löschen (Schreibrechte)",
	"workspaces:read":  "Workspaces abfragen (Leserechte)",
	"workspaces:write": "Workspaces erstellen, bearbeiten & löschen (Schreibrechte)",
	"settings:read":    "Einstellungen abfragen (Leserechte)",
	"settings:write":   "Einstellungen ändern (Schreibrechte)",
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
		{Key: "events:write", Description: SupportedScopes["events:write"], Implemented: true},
		{Key: "notes:read", Description: SupportedScopes["notes:read"], Implemented: true},
		{Key: "notes:write", Description: SupportedScopes["notes:write"], Implemented: true},
		{Key: "todos:read", Description: SupportedScopes["todos:read"], Implemented: true},
		{Key: "todos:write", Description: SupportedScopes["todos:write"], Implemented: true},
		{Key: "todos:create", Description: SupportedScopes["todos:create"], Implemented: true},
		{Key: "todos:edit", Description: SupportedScopes["todos:edit"], Implemented: true},
		{Key: "todos:delete", Description: SupportedScopes["todos:delete"], Implemented: true},
		{Key: "folders:read", Description: SupportedScopes["folders:read"], Implemented: true},
		{Key: "folders:write", Description: SupportedScopes["folders:write"], Implemented: true},
		{Key: "tags:read", Description: SupportedScopes["tags:read"], Implemented: true},
		{Key: "tags:write", Description: SupportedScopes["tags:write"], Implemented: true},
		{Key: "workspaces:read", Description: SupportedScopes["workspaces:read"], Implemented: true},
		{Key: "workspaces:write", Description: SupportedScopes["workspaces:write"], Implemented: true},
		{Key: "settings:read", Description: SupportedScopes["settings:read"], Implemented: true},
		{Key: "settings:write", Description: SupportedScopes["settings:write"], Implemented: true},
		{Key: ScopeStorageExpand, Description: SupportedScopes[ScopeStorageExpand], Implemented: true},
		{Key: "*", Description: "Vollzugriff auf die gesamte API (ausgenommen sensible Kontodaten wie PIN, E-Mail, Vault und API-Tokens)", Implemented: true},
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
	if req.ExpiresInDays < 0 || req.ExpiresInDays > 3650 {
		http.Error(w, "expires_in_days must be between 0 and 3650", http.StatusBadRequest)
		return
	}

	// Validate scopes
	var validScopes []string
	for _, sc := range req.Scopes {
		sc = strings.TrimSpace(sc)
		if strings.HasPrefix(sc, "folder:") {
			folderID := strings.TrimPrefix(sc, "folder:")
			if _, err := uuid.Parse(folderID); err != nil {
				http.Error(w, "Invalid folder scope ID", http.StatusBadRequest)
				return
			}
			file, err := h.Store.GetAccessibleFile(r.Context(), folderID, userID)
			if err != nil {
				if errors.Is(err, store.ErrNotFound) {
					http.Error(w, "Forbidden: no access to scoped folder", http.StatusForbidden)
					return
				}
				http.Error(w, "Failed to verify folder access", http.StatusInternalServerError)
				return
			}
			if file == nil || file.Type != db.FileTypeFolder || hasIsGroupFlag(file.PublicMeta) || hasIsGroupFlag(file.Metadata) {
				http.Error(w, "Invalid folder scope: target is not a folder", http.StatusBadRequest)
				return
			}
			validScopes = append(validScopes, sc)
			continue
		}
		if _, exists := SupportedScopes[sc]; exists || strings.HasPrefix(sc, "safe:") || sc == "*" {
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

// ValidateStorageExpandToken checks if the given token string is a valid API token with the storage:expand scope.
func ValidateStorageExpandToken(ctx context.Context, store *store.SQLiteStore, rawToken string) bool {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return false
	}
	// Strip "Bearer " if present
	if strings.HasPrefix(strings.ToLower(rawToken), "bearer ") {
		rawToken = strings.TrimSpace(rawToken[7:])
	}
	// Compute SHA-256 hash of token
	h := sha256.Sum256([]byte(rawToken))
	tokenHash := hex.EncodeToString(h[:])

	token, err := store.GetAPITokenByHash(ctx, tokenHash)
	if err != nil || token == nil {
		return false
	}
	// Check expiration
	if token.ExpiresAt != nil && token.ExpiresAt.Before(time.Now()) {
		return false
	}
	// Check scope
	for _, sc := range token.Scopes {
		if sc == ScopeStorageExpand || sc == "*" {
			return true
		}
	}
	return false
}

// hasIsGroupFlag reports whether a JSON metadata payload marks the entry as a tag/group (isGroup: true or 1).
func hasIsGroupFlag(raw json.RawMessage) bool {
	if len(raw) == 0 {
		return false
	}
	var m map[string]interface{}
	if err := json.Unmarshal(raw, &m); err != nil || m == nil {
		return false
	}
	switch v := m["isGroup"].(type) {
	case bool:
		return v
	case float64:
		return v == 1
	default:
		return false
	}
}

