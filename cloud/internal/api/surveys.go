package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

// CreateSurveyResponseInput represents the payload for creating a survey response.
type CreateSurveyResponseInput struct {
	ID        string          `json:"id,omitempty"`
	SurveyID  string          `json:"survey_id"`
	Data      json.RawMessage `json:"data"`
	CreatedAt string          `json:"created_at,omitempty"`
}

// GetUserID extracts the authenticated user ID from context.
func GetUserID(ctx context.Context) string {
	if uid, ok := ctx.Value("user_id").(string); ok {
		return uid
	}
	return ""
}

// SurveysHandler handles REST endpoints for survey responses.
type SurveysHandler struct {
	Store *store.SQLiteStore
}

// NewSurveysHandler creates a new SurveysHandler instance.
func NewSurveysHandler(s *store.SQLiteStore) *SurveysHandler {
	return &SurveysHandler{Store: s}
}

// RegisterRoutes mounts all survey routes on the given chi.Router.
func (h *SurveysHandler) RegisterRoutes(r chi.Router) {
	r.Get("/responses", h.RequireScopes("surveys:read", "surveys:write")(h.ListResponses))
	r.Post("/responses", h.RequireScopes("surveys:create", "surveys:write")(h.CreateResponse))
	r.Delete("/responses/{id}", h.RequireScopes("surveys:delete", "surveys:write")(h.DeleteResponse))
}

// RequireScopes validates incoming requests against API tokens or user session JWTs.
func (h *SurveysHandler) RequireScopes(allowedScopes ...string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			tokenString := ""

			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				tokenString = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
			}
			if tokenString == "" {
				tokenString = strings.TrimSpace(r.Header.Get("X-API-Key"))
			}
			if tokenString == "" {
				tokenString = strings.TrimSpace(r.URL.Query().Get("api_token"))
			}

			// Case 1: An API Token is provided (starts with tide_pat_ or supplied via X-API-Key / api_token)
			if strings.HasPrefix(tokenString, "tide_pat_") || r.Header.Get("X-API-Key") != "" || r.URL.Query().Get("api_token") != "" {
				hashBytes := sha256.Sum256([]byte(tokenString))
				tokenHash := hex.EncodeToString(hashBytes[:])

				apiToken, err := h.Store.GetAPITokenByHash(r.Context(), tokenHash)
				if err != nil {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusUnauthorized)
					json.NewEncoder(w).Encode(map[string]string{
						"error":   "Unauthorized",
						"message": "Invalid API token",
					})
					return
				}

				if apiToken.ExpiresAt != nil && time.Now().After(*apiToken.ExpiresAt) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusUnauthorized)
					json.NewEncoder(w).Encode(map[string]string{
						"error":   "Unauthorized",
						"message": "API token has expired",
					})
					return
				}

				hasScope := false
				for _, sc := range apiToken.Scopes {
					if sc == "*" {
						hasScope = true
						break
					}
					for _, allowed := range allowedScopes {
						if sc == allowed {
							hasScope = true
							break
						}
					}
					if hasScope {
						break
					}
				}

				if !hasScope {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusForbidden)
					json.NewEncoder(w).Encode(map[string]interface{}{
						"error":           "Forbidden",
						"message":         "Token lacks required scope",
						"required_scopes": allowedScopes,
						"token_scopes":    apiToken.Scopes,
					})
					return
				}

				// Asynchronously update last_used_at
				go func(tokenID string) {
					ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
					defer cancel()
					_ = h.Store.UpdateAPITokenLastUsed(ctx, tokenID, time.Now())
				}(apiToken.ID)

				ctx := context.WithValue(r.Context(), "user_id", apiToken.UserID)
				ctx = context.WithValue(ctx, "api_token_id", apiToken.ID)
				next(w, r.WithContext(ctx))
				return
			}

			// Case 2: Session cookie or generic Bearer JWT
			jwtTokenString := tokenString
			if jwtTokenString == "" {
				if cookie, err := r.Cookie("tide_session"); err == nil {
					jwtTokenString = cookie.Value
				}
			}

			if jwtTokenString != "" {
				// Also check if the raw token happens to match an API token in the database
				hashBytes := sha256.Sum256([]byte(jwtTokenString))
				tokenHash := hex.EncodeToString(hashBytes[:])
				if apiToken, err := h.Store.GetAPITokenByHash(r.Context(), tokenHash); err == nil && apiToken != nil {
					if apiToken.ExpiresAt != nil && time.Now().After(*apiToken.ExpiresAt) {
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusUnauthorized)
						json.NewEncoder(w).Encode(map[string]string{
							"error":   "Unauthorized",
							"message": "API token has expired",
						})
						return
					}
					hasScope := false
					for _, sc := range apiToken.Scopes {
						if sc == "*" {
							hasScope = true
							break
						}
						for _, allowed := range allowedScopes {
							if sc == allowed {
								hasScope = true
								break
							}
						}
						if hasScope {
							break
						}
					}
					if !hasScope {
						w.Header().Set("Content-Type", "application/json")
						w.WriteHeader(http.StatusForbidden)
						json.NewEncoder(w).Encode(map[string]interface{}{
							"error":           "Forbidden",
							"message":         "Token lacks required scope",
							"required_scopes": allowedScopes,
							"token_scopes":    apiToken.Scopes,
						})
						return
					}

					go func(tokenID string) {
						ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
						defer cancel()
						_ = h.Store.UpdateAPITokenLastUsed(ctx, tokenID, time.Now())
					}(apiToken.ID)

					ctx := context.WithValue(r.Context(), "user_id", apiToken.UserID)
					ctx = context.WithValue(ctx, "api_token_id", apiToken.ID)
					next(w, r.WithContext(ctx))
					return
				}

				jwtKeyStr := os.Getenv("JWT_SECRET")
				if jwtKeyStr == "" {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusInternalServerError)
					json.NewEncoder(w).Encode(map[string]string{
						"error":   "Server Error",
						"message": "JWT secret is not configured",
					})
					return
				}

				token, err := jwt.Parse(jwtTokenString, func(t *jwt.Token) (interface{}, error) {
					if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
						return nil, http.ErrAbortHandler
					}
					return []byte(jwtKeyStr), nil
				})

				if err == nil && token.Valid {
					if claims, ok := token.Claims.(jwt.MapClaims); ok {
						if userID, ok := claims["sub"].(string); ok && userID != "" {
							ctx := context.WithValue(r.Context(), "user_id", userID)
							next(w, r.WithContext(ctx))
							return
						}
					}
				}
			}

			// If already authenticated by outer middleware (e.g. AuthMiddleware)
			if uid, ok := r.Context().Value("user_id").(string); ok && uid != "" {
				next(w, r)
				return
			}

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Unauthorized",
				"message": "Missing or invalid API token. Provide via 'Authorization: Bearer <token>' or 'X-API-Key: <token>' header.",
			})
		}
	}
}

// ListResponses handles GET /api/v1/surveys/responses.
func (h *SurveysHandler) ListResponses(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	surveyID := strings.TrimSpace(r.URL.Query().Get("survey_id"))

	responses, err := h.Store.GetSurveyResponses(r.Context(), userID, surveyID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to query survey responses",
		})
		return
	}

	if responses == nil {
		responses = make([]*db.SurveyResponse, 0)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(responses)
}

// CreateResponse handles POST /api/v1/surveys/responses.
func (h *SurveysHandler) CreateResponse(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var input CreateSurveyResponseInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Invalid JSON request body",
		})
		return
	}

	surveyID := strings.TrimSpace(input.SurveyID)
	if surveyID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "survey_id is required",
		})
		return
	}

	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uuid.New().String()
	}

	dataStr := "{}"
	if len(input.Data) > 0 {
		var strVal string
		if err := json.Unmarshal(input.Data, &strVal); err == nil {
			dataStr = strVal
		} else {
			dataStr = string(input.Data)
		}
	}

	now := time.Now().UTC()
	createdAt := now
	if input.CreatedAt != "" {
		if t, err := time.Parse(time.RFC3339, input.CreatedAt); err == nil {
			createdAt = t
		}
	}
	updatedAt := now

	resp := &db.SurveyResponse{
		ID:        id,
		UserID:    userID,
		SurveyID:  surveyID,
		Data:      dataStr,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}

	if err := h.Store.CreateSurveyResponse(r.Context(), resp); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to create survey response",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// DeleteResponse handles DELETE /api/v1/surveys/responses/{id}.
func (h *SurveysHandler) DeleteResponse(w http.ResponseWriter, r *http.Request) {
	userID := GetUserID(r.Context())
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Missing response ID",
		})
		return
	}

	if err := h.Store.DeleteSurveyResponse(r.Context(), userID, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Not Found",
				"message": "Survey response not found",
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to delete survey response",
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
