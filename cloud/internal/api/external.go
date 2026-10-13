package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/store"
)

type ExternalHandler struct {
	Store *store.SQLiteStore
}

func NewExternalHandler(s *store.SQLiteStore) *ExternalHandler {
	return &ExternalHandler{Store: s}
}

// APITokenAuth middleware validates the Bearer token or X-API-Key against the api_tokens table
// and enforces that the token has the required scope.
func APITokenAuth(s *store.SQLiteStore, requiredScope string) func(http.Handler) http.Handler {
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
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "Unauthorized",
					"message": "Missing API token. Provide via 'Authorization: Bearer <token>' or 'X-API-Key: <token>' header.",
				})
				return
			}

			// Compute SHA-256 hash of provided token
			hashBytes := sha256.Sum256([]byte(tokenString))
			tokenHash := hex.EncodeToString(hashBytes[:])

			// Look up token in database
			apiToken, err := s.GetAPITokenByHash(r.Context(), tokenHash)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "Unauthorized",
					"message": "Invalid API token",
				})
				return
			}

			// Check expiration
			if apiToken.ExpiresAt != nil && time.Now().After(*apiToken.ExpiresAt) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "Unauthorized",
					"message": "API token has expired",
				})
				return
			}

			// Check scope
			hasScope := false
			for _, sc := range apiToken.Scopes {
				if sc == requiredScope {
					hasScope = true
					break
				}
			}
			if !hasScope {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":          "Forbidden",
					"message":        "Token lacks required scope '" + requiredScope + "'",
					"required_scope": requiredScope,
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

			// Inject user_id into context
			ctx := context.WithValue(r.Context(), "user_id", apiToken.UserID)
			ctx = context.WithValue(ctx, "api_token_id", apiToken.ID)
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

	// Notes endpoints (Stubs for future implementation)
	r.Group(func(r chi.Router) {
		r.Use(APITokenAuth(h.Store, "notes:read"))
		r.Get("/notes", h.ListNotesStub)
		r.Get("/notes/{id}", h.GetNoteStub)
	})
}

func (h *ExternalHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	q := r.URL.Query()

	// Parse start / from date
	var startTime *time.Time
	startStr := q.Get("start")
	if startStr == "" {
		startStr = q.Get("from")
	}
	if startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			startTime = &t
		} else if t, err := time.Parse("2006-01-02", startStr); err == nil {
			startTime = &t
		} else {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Bad Request",
				"message": "Invalid 'start' format. Use ISO 8601 / RFC 3339 (e.g. 2026-10-13T00:00:00Z or 2026-10-13).",
			})
			return
		}
	}

	// Parse end / to date
	var endTime *time.Time
	endStr := q.Get("end")
	if endStr == "" {
		endStr = q.Get("to")
	}
	if endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			endTime = &t
		} else if t, err := time.Parse("2006-01-02", endStr); err == nil {
			// Include the whole end day
			endOfDay := t.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			endTime = &endOfDay
		} else {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Bad Request",
				"message": "Invalid 'end' format. Use ISO 8601 / RFC 3339 (e.g. 2026-10-13T23:59:59Z or 2026-10-13).",
			})
			return
		}
	}

	// Search text
	search := q.Get("search")
	if search == "" {
		search = q.Get("q")
	}

	// Limit
	limit := 100
	if limitStr := q.Get("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
			if parsedLimit > 500 {
				limit = 500
			} else {
				limit = parsedLimit
			}
		}
	}

	events, err := h.Store.ListEventsForExternalAPI(r.Context(), userID, startTime, endTime, search, limit)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to retrieve events",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":  len(events),
		"events": events,
	})
}

func (h *ExternalHandler) GetEvent(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	eventID := chi.URLParam(r, "id")
	if eventID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Bad Request", "message": "Missing event ID"})
		return
	}

	event, err := h.Store.GetEventForExternalAPI(r.Context(), userID, eventID)
	if err != nil {
		if err == store.ErrNotFound {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Not Found", "message": "Event not found"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Internal Server Error", "message": "Failed to retrieve event"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"event": event,
	})
}

func (h *ExternalHandler) ListNotesStub(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":          "Not Implemented",
		"message":        "Notes querying via external API is planned and will be available in an upcoming update.",
		"required_scope": "notes:read",
	})
}

func (h *ExternalHandler) GetNoteStub(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":          "Not Implemented",
		"message":        "Note retrieval via external API is planned and will be available in an upcoming update.",
		"required_scope": "notes:read",
	})
}
