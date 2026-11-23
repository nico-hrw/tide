package api

import (
	"context"
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
		return DualAuthMiddleware(h.Store, allowedScopes...)(next).ServeHTTP
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
	} else if _, err := uuid.Parse(id); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Invalid id format; must be a valid UUID",
		})
		return
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
