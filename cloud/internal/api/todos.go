package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

// TodosHandler handles REST endpoints for Todos with Personal Access Token authentication,
// granular permission scopes, and rich filtering.
type TodosHandler struct {
	Store *store.SQLiteStore
}

// NewTodosHandler creates a new TodosHandler instance.
func NewTodosHandler(s *store.SQLiteStore) *TodosHandler {
	return &TodosHandler{Store: s}
}

// RegisterRoutes mounts all todo routes on the given chi.Router.
func (h *TodosHandler) RegisterRoutes(r chi.Router) {
	r.Get("/", h.RequireScopes("todos:read", "todos:write")(h.List))
	r.Post("/", h.RequireScopes("todos:create", "todos:write")(h.Create))
	r.Get("/{id}", h.RequireScopes("todos:read", "todos:write")(h.Get))
	r.Put("/{id}", h.RequireScopes("todos:edit", "todos:write")(h.Update))
	r.Patch("/{id}", h.RequireScopes("todos:edit", "todos:write")(h.Update))
	r.Delete("/{id}", h.RequireScopes("todos:delete", "todos:write")(h.Delete))
}

// RequireScopes validates incoming requests against API tokens or user session JWTs.
// It verifies that API tokens have at least one of allowedScopes (or the wildcard "*").
func (h *TodosHandler) RequireScopes(allowedScopes ...string) func(http.HandlerFunc) http.HandlerFunc {
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

				// Otherwise, validate as JWT
				jwtKeyStr := os.Getenv("JWT_SECRET")
				if jwtKeyStr != "" {
					jwtKey := []byte(jwtKeyStr)
					token, err := jwt.Parse(jwtTokenString, func(t *jwt.Token) (interface{}, error) {
						if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
							return nil, http.ErrAbortHandler
						}
						return jwtKey, nil
					})

					if err == nil && token != nil && token.Valid {
						if claims, ok := token.Claims.(jwt.MapClaims); ok {
							if userID, ok := claims["sub"].(string); ok && userID != "" {
								ctx := context.WithValue(r.Context(), "user_id", userID)
								next(w, r.WithContext(ctx))
								return
							}
						}
					}
				}
			}

			// Unauthorized fallback
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Unauthorized",
				"message": "Missing or invalid API token. Provide via 'Authorization: Bearer <token>' or 'X-API-Key: <token>' header.",
			})
		}
	}
}

// List handles GET /api/v1/todos with rich filtering.
func (h *TodosHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	q := r.URL.Query()

	date := q.Get("date")
	prio := q.Get("prio")
	if prio == "" {
		prio = q.Get("priority")
	}
	tag := q.Get("tag")

	description := q.Get("description")
	if description == "" {
		description = q.Get("q")
	}
	if description == "" {
		description = q.Get("search")
	}

	var overdue *bool
	if overdueStr := q.Get("overdue"); overdueStr != "" {
		isO := (overdueStr == "true" || overdueStr == "1")
		overdue = &isO
	}

	status := q.Get("status")

	var completed *bool
	if completedStr := q.Get("completed"); completedStr != "" {
		isC := (completedStr == "true" || completedStr == "1")
		completed = &isC
	}

	limit := 100
	if limitStr := q.Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}

	offset := 0
	if offsetStr := q.Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	filter := store.TodoFilter{
		Date:        date,
		Priority:    prio,
		Tag:         tag,
		Description: description,
		Search:      description,
		Overdue:     overdue,
		Status:      status,
		IsCompleted: completed,
		Limit:       limit,
		Offset:      offset,
	}

	todos, err := h.Store.GetTodos(r.Context(), userID, filter)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to query todos",
		})
		return
	}

	if todos == nil {
		todos = make([]*db.Todo, 0)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(todos)
}

// CreateTodoInput represents the payload for creating a new todo.
type CreateTodoInput struct {
	Title         string   `json:"title"`
	Description   string   `json:"description,omitempty"`
	Status        string   `json:"status,omitempty"`
	Priority      string   `json:"priority,omitempty"`
	DueDate       string   `json:"due_date,omitempty"`
	ScheduledDate string   `json:"scheduled_date,omitempty"`
	Tags          []string `json:"tags,omitempty"`
	Color         string   `json:"color,omitempty"`
	IsCompleted   bool     `json:"is_completed,omitempty"`
}

// Create handles POST /api/v1/todos.
func (h *TodosHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var input CreateTodoInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Invalid JSON request body",
		})
		return
	}

	title := strings.TrimSpace(input.Title)
	if title == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Title is required",
		})
		return
	}

	todo := &db.Todo{
		ID:            uuid.New().String(),
		UserID:        userID,
		Title:         title,
		Description:   strings.TrimSpace(input.Description),
		Status:        strings.TrimSpace(input.Status),
		Priority:      strings.TrimSpace(input.Priority),
		DueDate:       strings.TrimSpace(input.DueDate),
		ScheduledDate: strings.TrimSpace(input.ScheduledDate),
		Tags:          input.Tags,
		Color:         strings.TrimSpace(input.Color),
		IsCompleted:   input.IsCompleted,
		CreatedAt:     time.Now().UTC(),
		UpdatedAt:     time.Now().UTC(),
	}

	if err := h.Store.CreateTodo(r.Context(), userID, todo); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to create todo",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(todo)
}

// Get handles GET /api/v1/todos/{id}.
func (h *TodosHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	todoID := chi.URLParam(r, "id")
	if strings.TrimSpace(todoID) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Missing todo ID",
		})
		return
	}

	todo, err := h.Store.GetTodoByID(r.Context(), userID, todoID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Not Found",
				"message": "Todo not found",
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to retrieve todo",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(todo)
}

// UpdateTodoInput represents fields that can be updated via PUT or PATCH.
type UpdateTodoInput struct {
	Title         *string   `json:"title,omitempty"`
	Description   *string   `json:"description,omitempty"`
	Status        *string   `json:"status,omitempty"`
	Priority      *string   `json:"priority,omitempty"`
	DueDate       *string   `json:"due_date,omitempty"`
	ScheduledDate *string   `json:"scheduled_date,omitempty"`
	Tags          *[]string `json:"tags,omitempty"`
	Color         *string   `json:"color,omitempty"`
	IsCompleted   *bool     `json:"is_completed,omitempty"`
}

// Update handles PUT and PATCH /api/v1/todos/{id}.
func (h *TodosHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	todoID := chi.URLParam(r, "id")
	if strings.TrimSpace(todoID) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Missing todo ID",
		})
		return
	}

	existing, err := h.Store.GetTodoByID(r.Context(), userID, todoID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Not Found",
				"message": "Todo not found",
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to retrieve todo",
		})
		return
	}

	var input UpdateTodoInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Invalid JSON request body",
		})
		return
	}

	if input.Title != nil {
		trimmed := strings.TrimSpace(*input.Title)
		if trimmed == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Bad Request",
				"message": "Title cannot be empty",
			})
			return
		}
		existing.Title = trimmed
	}

	if input.Description != nil {
		existing.Description = strings.TrimSpace(*input.Description)
	}
	if input.Status != nil {
		existing.Status = strings.TrimSpace(*input.Status)
	}
	if input.Priority != nil {
		existing.Priority = strings.TrimSpace(*input.Priority)
	}
	if input.DueDate != nil {
		existing.DueDate = strings.TrimSpace(*input.DueDate)
	}
	if input.ScheduledDate != nil {
		existing.ScheduledDate = strings.TrimSpace(*input.ScheduledDate)
	}
	if input.Tags != nil {
		existing.Tags = *input.Tags
	}
	if input.Color != nil {
		existing.Color = strings.TrimSpace(*input.Color)
	}
	if input.IsCompleted != nil {
		existing.IsCompleted = *input.IsCompleted
		if existing.IsCompleted {
			if existing.CompletedAt == nil {
				now := time.Now().UTC()
				existing.CompletedAt = &now
			}
			if existing.Status == "todo" {
				existing.Status = "completed"
			}
		} else {
			existing.CompletedAt = nil
			if existing.Status == "completed" {
				existing.Status = "todo"
			}
		}
	}
	if input.Status != nil && strings.TrimSpace(*input.Status) == "completed" && !existing.IsCompleted {
		existing.IsCompleted = true
		if existing.CompletedAt == nil {
			now := time.Now().UTC()
			existing.CompletedAt = &now
		}
	}

	if err := h.Store.UpdateTodo(r.Context(), userID, existing); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to update todo",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(existing)
}

// Delete handles DELETE /api/v1/todos/{id}.
func (h *TodosHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	todoID := chi.URLParam(r, "id")
	if strings.TrimSpace(todoID) == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Bad Request",
			"message": "Missing todo ID",
		})
		return
	}

	if err := h.Store.DeleteTodo(r.Context(), userID, todoID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{
				"error":   "Not Found",
				"message": "Todo not found",
			})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to delete todo",
		})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
