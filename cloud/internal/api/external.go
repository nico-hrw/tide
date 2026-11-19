package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type ExternalHandler struct {
	Store     *store.SQLiteStore
	BlobStore store.BlobStore
}

func NewExternalHandler(s *store.SQLiteStore, b ...store.BlobStore) *ExternalHandler {
	h := &ExternalHandler{Store: s}
	if len(b) > 0 {
		h.BlobStore = b[0]
	}
	return h
}

func writeExternalJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(payload)
}

func writeExternalError(w http.ResponseWriter, status int, errTitle, message string) {
	writeExternalJSON(w, status, map[string]string{
		"error":   errTitle,
		"message": message,
	})
}

// APITokenAuth middleware validates the Bearer token or X-API-Key against the api_tokens table
// and enforces that the token has at least one of the required scopes (or wildcard "*").
func APITokenAuth(s *store.SQLiteStore, requiredScopes ...string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			var tokenString string

			// 1. Check Authorization Bearer header
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenString = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
			}

			// 2. Fallback to X-API-Key header
			if tokenString == "" {
				tokenString = strings.TrimSpace(r.Header.Get("X-API-Key"))
			}

			// 3. Fallback to query param 'api_token'
			if tokenString == "" {
				tokenString = strings.TrimSpace(r.URL.Query().Get("api_token"))
			}

			if tokenString == "" {
				writeExternalError(w, http.StatusUnauthorized, "Unauthorized",
					"Missing API token. Provide via 'Authorization: Bearer <token>' or 'X-API-Key: <token>' header.")
				return
			}

			// Compute SHA-256 hash of provided token
			hashBytes := sha256.Sum256([]byte(tokenString))
			tokenHash := hex.EncodeToString(hashBytes[:])

			// Look up token in database
			apiToken, err := s.GetAPITokenByHash(r.Context(), tokenHash)
			if err != nil {
				writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Invalid API token")
				return
			}

			// Check expiration
			if apiToken.ExpiresAt != nil && time.Now().After(*apiToken.ExpiresAt) {
				writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "API token has expired")
				return
			}

			// Check scope
			hasScope := false
			for _, sc := range apiToken.Scopes {
				if sc == "*" {
					hasScope = true
					break
				}
				for _, req := range requiredScopes {
					if sc == req {
						hasScope = true
						break
					}
					// safe:... and folder:... only narrow what a token may see, so they may stand in for
					// read access. They must never grant write access: before, a read-only token that was
					// restricted to a safe passed the notes:write check as well.
					if req == "notes:read" && (strings.HasPrefix(sc, "safe:") || strings.HasPrefix(sc, "folder:")) {
						hasScope = true
						break
					}
				}
				if hasScope {
					break
				}
			}
			if !hasScope {
				reqDesc := strings.Join(requiredScopes, " or ")
				writeExternalJSON(w, http.StatusForbidden, map[string]interface{}{
					"error":          "Forbidden",
					"message":        "Token lacks required scope '" + reqDesc + "'",
					"required_scope": reqDesc,
					"token_scopes":   apiToken.Scopes,
				})
				return
			}

			// Update last_used_at asynchronously
			go func(tokenID string) {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				_ = s.UpdateAPITokenLastUsed(ctx, tokenID, time.Now())
			}(apiToken.ID)

			// Inject user_id and token_scopes into context
			ctx := context.WithValue(r.Context(), "user_id", apiToken.UserID)
			ctx = context.WithValue(ctx, "api_token_id", apiToken.ID)
			ctx = context.WithValue(ctx, "token_scopes", apiToken.Scopes)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func (h *ExternalHandler) RegisterRoutes(r chi.Router) {
	// Calendar Events endpoints
	r.Group(func(r chi.Router) {
		r.Use(APITokenAuth(h.Store, "events:read"))
		r.Get("/events", h.ListEvents)
		r.Get("/events/{id}", h.GetEvent)
	})

	// Notes endpoints
	r.Group(func(r chi.Router) {
		r.Use(APITokenAuth(h.Store, "notes:read", "notes:write"))
		r.Get("/notes", h.ListNotes)
		r.Get("/notes/{id}", h.GetNote)
	})
	r.Group(func(r chi.Router) {
		r.Use(APITokenAuth(h.Store, "notes:write"))
		r.Post("/notes", h.CreateNote)
		r.Put("/notes/{id}", h.UpdateNote)
		r.Patch("/notes/{id}", h.UpdateNote)
		r.Delete("/notes/{id}", h.DeleteNote)
	})

	// Todos endpoints
	todosHandler := NewTodosHandler(h.Store)
	r.Route("/todos", todosHandler.RegisterRoutes)
}

func extractScopes(r *http.Request) (safes []string, folders []string) {
	scopes, _ := r.Context().Value("token_scopes").([]string)
	for _, sc := range scopes {
		if strings.HasPrefix(sc, "safe:") {
			s := strings.TrimSpace(strings.TrimPrefix(sc, "safe:"))
			if s != "" {
				safes = append(safes, s)
			}
		} else if strings.HasPrefix(sc, "folder:") {
			f := strings.TrimSpace(strings.TrimPrefix(sc, "folder:"))
			if f != "" {
				folders = append(folders, f)
			}
		}
	}
	return
}

func normSafeName(s string) string {
	s = strings.TrimSpace(s)
	if s == "" || s == "Standard" {
		return "main"
	}
	return s
}

func (h *ExternalHandler) getFileSafe(ctx context.Context, file *db.File) string {
	var meta struct {
		Safe string `json:"safe"`
	}
	if len(file.Metadata) > 0 {
		_ = json.Unmarshal(file.Metadata, &meta)
	}
	if meta.Safe != "" {
		return normSafeName(meta.Safe)
	}
	if file.ParentID != nil && *file.ParentID != "" {
		if parent, err := h.Store.GetAccessibleFile(ctx, *file.ParentID, file.OwnerID); err == nil {
			var pMeta struct {
				Safe string `json:"safe"`
			}
			if len(parent.Metadata) > 0 {
				_ = json.Unmarshal(parent.Metadata, &pMeta)
				if pMeta.Safe != "" {
					return normSafeName(pMeta.Safe)
				}
			}
		}
	}
	return "main"
}

func (h *ExternalHandler) noteMatchesScope(ctx context.Context, file *db.File, safes []string, folders []string) bool {
	if len(safes) == 0 && len(folders) == 0 {
		return true
	}

	if len(folders) > 0 {
		matchesFolder := false
		currParentID := file.ParentID
		for depth := 0; depth < 5 && currParentID != nil && *currParentID != ""; depth++ {
			for _, fID := range folders {
				if *currParentID == fID {
					matchesFolder = true
					break
				}
			}
			if matchesFolder {
				break
			}
			parentFile, err := h.Store.GetAccessibleFile(ctx, *currParentID, file.OwnerID)
			if err != nil {
				break
			}
			currParentID = parentFile.ParentID
		}
		if !matchesFolder {
			return false
		}
	}

	if len(safes) > 0 {
		fileSafe := h.getFileSafe(ctx, file)
		matchesSafe := false
		for _, s := range safes {
			if normSafeName(s) == fileSafe {
				matchesSafe = true
				break
			}
		}
		if !matchesSafe {
			return false
		}
	}

	return true
}
