package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

// TodosHandler handles REST endpoints for Todos with Personal Access Token / JWT authentication,
// granular permission scopes, rich filtering, and SSE broadcasts.
type TodosHandler struct {
	Store  *store.SQLiteStore
	Broker *Broker
}

// NewTodosHandler creates a new TodosHandler instance.
func NewTodosHandler(s *store.SQLiteStore) *TodosHandler {
	return &TodosHandler{Store: s}
}

// WithBroker attaches an SSE Broker for real-time todo event broadcasts.
func (h *TodosHandler) WithBroker(b *Broker) *TodosHandler {
	h.Broker = b
	return h
}

func writeTodoJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeTodoError(w http.ResponseWriter, status int, errTitle, message string) {
	writeTodoJSON(w, status, map[string]string{
		"error":   errTitle,
		"message": message,
	})
}

func (h *TodosHandler) broadcastTodoEvent(userID string, payload map[string]interface{}) {
	if h.Broker == nil || userID == "" {
		return
	}
	b, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.Broker.Broadcast(userID, string(b))
}

func requireUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	return userID, true
}

func isAPITokenRequest(r *http.Request) bool {
	tokenID, ok := r.Context().Value("api_token_id").(string)
	return ok && tokenID != ""
}

func redactTodoForExternalAPI(t *db.Todo) *db.Todo {
	if t == nil || !t.IsEncrypted {
		return t
	}
	return &db.Todo{
		ID:             t.ID,
		UserID:         t.UserID,
		Status:         "todo",
		Priority:       "medium",
		Tags:           []string{},
		Recurrence:     "none",
		CompletedDates: []string{},
		LinkedSafes:    []string{},
		IsEncrypted:    true,
		CreatedAt:      t.CreatedAt,
		UpdatedAt:      t.UpdatedAt,
	}
}

func parseBoolParam(val string) *bool {
	if val == "" {
		return nil
	}
	b := val == "true" || val == "1"
	return &b
}

func nonNilStrings(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

func applyTrimmed(dst, src *string) {
	if src != nil {
		*dst = strings.TrimSpace(*src)
	}
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

// RequireScopes validates incoming requests against API tokens or user session JWTs
// via DualAuthMiddleware, ensuring API tokens have at least one of allowedScopes (or "*").
func (h *TodosHandler) RequireScopes(allowedScopes ...string) func(http.HandlerFunc) http.HandlerFunc {
	return func(next http.HandlerFunc) http.HandlerFunc {
		return DualAuthMiddleware(h.Store, allowedScopes...)(next).ServeHTTP
	}
}

// List handles GET /api/v1/todos with rich filtering.
func (h *TodosHandler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	q := r.URL.Query()

	prio := q.Get("prio")
	if prio == "" {
		prio = q.Get("priority")
	}
	description := q.Get("description")
	if description == "" {
		description = q.Get("q")
	}
	if description == "" {
		description = q.Get("search")
	}

	limit := 100
	if limitStr := q.Get("limit"); limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
			limit = l
		}
	}
	if limit > 500 {
		limit = 500
	}

	offset := 0
	if offsetStr := q.Get("offset"); offsetStr != "" {
		if o, err := strconv.Atoi(offsetStr); err == nil && o >= 0 {
			offset = o
		}
	}

	filter := store.TodoFilter{
		Date:            q.Get("date"),
		Priority:        prio,
		Tag:             q.Get("tag"),
		Description:     description,
		Search:          description,
		Overdue:         parseBoolParam(q.Get("overdue")),
		Status:          q.Get("status"),
		IsCompleted:     parseBoolParam(q.Get("completed")),
		Folder:          q.Get("folder"),
		IncludeArchived: parseBoolParam(q.Get("include_archived")),
		Limit:           limit,
		Offset:          offset,
	}

	todos, err := h.Store.GetTodos(r.Context(), userID, filter)
	if err != nil {
		writeTodoError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to query todos")
		return
	}

	if todos == nil {
		todos = make([]*db.Todo, 0)
	}
	if isAPITokenRequest(r) {
		redacted := make([]*db.Todo, len(todos))
		for i, t := range todos {
			redacted[i] = redactTodoForExternalAPI(t)
		}
		todos = redacted
	}

	writeTodoJSON(w, http.StatusOK, todos)
}

// CreateTodoInput represents the payload for creating a new todo.
type CreateTodoInput struct {
	ID               string   `json:"id,omitempty"`
	Title            string   `json:"title"`
	Description      string   `json:"description,omitempty"`
	Status           string   `json:"status,omitempty"`
	Priority         string   `json:"priority,omitempty"`
	DueDate          string   `json:"due_date,omitempty"`
	ScheduledDate    string   `json:"scheduled_date,omitempty"`
	Tags             []string `json:"tags,omitempty"`
	Color            string   `json:"color,omitempty"`
	IsCompleted      bool     `json:"is_completed,omitempty"`
	Folder           string   `json:"folder,omitempty"`
	LinkedNoteID     string   `json:"linked_note_id,omitempty"`
	Recurrence       string   `json:"recurrence,omitempty"`
	RecurrenceRule   string   `json:"recurrence_rule,omitempty"`
	RecurrenceEnd    string   `json:"recurrence_end,omitempty"`
	CompletedDates   []string `json:"completed_dates,omitempty"`
	ShowInCalendar   bool     `json:"show_in_calendar,omitempty"`
	IsArchived       bool     `json:"is_archived,omitempty"`
	ParentID         string   `json:"parent_id,omitempty"`
	SortOrder        int      `json:"order,omitempty"`
	Safe             string   `json:"safe,omitempty"`
	LinkedSafes      []string `json:"linked_safes,omitempty"`
	IsEncrypted      bool     `json:"is_encrypted,omitempty"`
	EncryptedPayload string   `json:"encrypted_payload,omitempty"`
}

// Create handles POST /api/v1/todos.
func (h *TodosHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	var input CreateTodoInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeTodoError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON request body")
		return
	}

	todoID := strings.TrimSpace(input.ID)
	if todoID != "" {
		if _, err := uuid.Parse(todoID); err != nil {
			writeTodoError(w, http.StatusBadRequest, "Bad Request", "Invalid todo ID")
			return
		}
	} else {
		todoID = uuid.New().String()
	}

	now := time.Now().UTC()
	var todo *db.Todo
	if input.IsEncrypted {
		encPayload := strings.TrimSpace(input.EncryptedPayload)
		if encPayload == "" {
			writeTodoError(w, http.StatusBadRequest, "Bad Request", "encrypted_payload is required for encrypted todos")
			return
		}
		todo = &db.Todo{
			ID:               todoID,
			UserID:           userID,
			Status:           "todo",
			Priority:         "medium",
			Tags:             []string{},
			Recurrence:       "none",
			CompletedDates:   []string{},
			LinkedSafes:      []string{},
			IsEncrypted:      true,
			EncryptedPayload: encPayload,
			CreatedAt:        now,
			UpdatedAt:        now,
		}
	} else {
		title := strings.TrimSpace(input.Title)
		if title == "" {
			writeTodoError(w, http.StatusBadRequest, "Bad Request", "Title is required")
			return
		}
		todo = &db.Todo{
			ID:             todoID,
			UserID:         userID,
			Title:          title,
			Description:    strings.TrimSpace(input.Description),
			Status:         strings.TrimSpace(input.Status),
			Priority:       strings.TrimSpace(input.Priority),
			DueDate:        strings.TrimSpace(input.DueDate),
			ScheduledDate:  strings.TrimSpace(input.ScheduledDate),
			Tags:           nonNilStrings(input.Tags),
			Color:          strings.TrimSpace(input.Color),
			IsCompleted:    input.IsCompleted,
			Folder:         strings.TrimSpace(input.Folder),
			LinkedNoteID:   strings.TrimSpace(input.LinkedNoteID),
			Recurrence:     strings.TrimSpace(input.Recurrence),
			RecurrenceRule: strings.TrimSpace(input.RecurrenceRule),
			RecurrenceEnd:  strings.TrimSpace(input.RecurrenceEnd),
			CompletedDates: nonNilStrings(input.CompletedDates),
			ShowInCalendar: input.ShowInCalendar,
			IsArchived:     input.IsArchived,
			ParentID:       strings.TrimSpace(input.ParentID),
			SortOrder:      input.SortOrder,
			Safe:           normalizeTodoSafe(input.Safe),
			LinkedSafes:    normalizeTodoLinkedSafes(input.LinkedSafes),
			CreatedAt:      now,
			UpdatedAt:      now,
		}
	}

	if err := h.Store.CreateTodo(r.Context(), userID, todo); err != nil {
		writeTodoError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to create todo")
		return
	}

	broadcastTodo := todo
	if todo.IsEncrypted {
		broadcastTodo = redactTodoForExternalAPI(todo)
	}
	h.broadcastTodoEvent(userID, map[string]interface{}{
		"type":    "todo_created",
		"todo_id": todo.ID,
		"todo":    broadcastTodo,
	})

	writeTodoJSON(w, http.StatusCreated, todo)
}

// Get handles GET /api/v1/todos/{id}.
func (h *TodosHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	todoID := chi.URLParam(r, "id")
	if strings.TrimSpace(todoID) == "" {
		writeTodoError(w, http.StatusBadRequest, "Bad Request", "Missing todo ID")
		return
	}

	todo, err := h.Store.GetTodoByID(r.Context(), userID, todoID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeTodoError(w, http.StatusNotFound, "Not Found", "Todo not found")
			return
		}
		writeTodoError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve todo")
		return
	}

	if todo.IsEncrypted && isAPITokenRequest(r) {
		writeTodoJSON(w, http.StatusOK, map[string]interface{}{
			"id":           todo.ID,
			"is_encrypted": true,
			"encrypted":    true,
			"message":      "This todo is end-to-end encrypted and cannot be decrypted without the user's private key",
			"created_at":   todo.CreatedAt,
			"updated_at":   todo.UpdatedAt,
		})
		return
	}

	writeTodoJSON(w, http.StatusOK, todo)
}

// UpdateTodoInput represents fields that can be updated via PUT or PATCH.
type UpdateTodoInput struct {
	Title            *string   `json:"title,omitempty"`
	Description      *string   `json:"description,omitempty"`
	Status           *string   `json:"status,omitempty"`
	Priority         *string   `json:"priority,omitempty"`
	DueDate          *string   `json:"due_date,omitempty"`
	ScheduledDate    *string   `json:"scheduled_date,omitempty"`
	Tags             *[]string `json:"tags,omitempty"`
	Color            *string   `json:"color,omitempty"`
	IsCompleted      *bool     `json:"is_completed,omitempty"`
	Folder           *string   `json:"folder,omitempty"`
	LinkedNoteID     *string   `json:"linked_note_id,omitempty"`
	Recurrence       *string   `json:"recurrence,omitempty"`
	RecurrenceRule   *string   `json:"recurrence_rule,omitempty"`
	RecurrenceEnd    *string   `json:"recurrence_end,omitempty"`
	CompletedDates   *[]string `json:"completed_dates,omitempty"`
	ShowInCalendar   *bool     `json:"show_in_calendar,omitempty"`
	IsArchived       *bool     `json:"is_archived,omitempty"`
	ParentID         *string   `json:"parent_id,omitempty"`
	SortOrder        *int      `json:"order,omitempty"`
	Safe             *string   `json:"safe,omitempty"`
	LinkedSafes      *[]string `json:"linked_safes,omitempty"`
	IsEncrypted      *bool     `json:"is_encrypted,omitempty"`
	EncryptedPayload *string   `json:"encrypted_payload,omitempty"`
}

// Update handles PUT and PATCH /api/v1/todos/{id}.
func (h *TodosHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	todoID := chi.URLParam(r, "id")
	if strings.TrimSpace(todoID) == "" {
		writeTodoError(w, http.StatusBadRequest, "Bad Request", "Missing todo ID")
		return
	}

	existing, err := h.Store.GetTodoByID(r.Context(), userID, todoID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeTodoError(w, http.StatusNotFound, "Not Found", "Todo not found")
			return
		}
		writeTodoError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve todo")
		return
	}

	if existing.IsEncrypted && isAPITokenRequest(r) {
		writeTodoJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":     "Bad Request",
			"encrypted": true,
			"message":   "Cannot overwrite an end-to-end encrypted todo via external API",
		})
		return
	}

	var input UpdateTodoInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeTodoError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON request body")
		return
	}

	wantsEncrypted := existing.IsEncrypted
	if input.IsEncrypted != nil {
		wantsEncrypted = *input.IsEncrypted
	}

	if wantsEncrypted {
		if input.EncryptedPayload != nil {
			trimmedPayload := strings.TrimSpace(*input.EncryptedPayload)
			if trimmedPayload == "" {
				writeTodoError(w, http.StatusBadRequest, "Bad Request", "encrypted_payload is required for encrypted todos")
				return
			}
			existing.EncryptedPayload = trimmedPayload
		}
		if strings.TrimSpace(existing.EncryptedPayload) == "" {
			writeTodoError(w, http.StatusBadRequest, "Bad Request", "encrypted_payload is required for encrypted todos")
			return
		}
		existing.IsEncrypted = true
	} else {
		if input.IsEncrypted != nil && !*input.IsEncrypted {
			existing.IsEncrypted = false
			existing.EncryptedPayload = ""
		}
		if input.Title != nil {
			trimmed := strings.TrimSpace(*input.Title)
			if trimmed == "" {
				writeTodoError(w, http.StatusBadRequest, "Bad Request", "Title cannot be empty")
				return
			}
			existing.Title = trimmed
		} else if strings.TrimSpace(existing.Title) == "" {
			writeTodoError(w, http.StatusBadRequest, "Bad Request", "Title is required")
			return
		}

		applyTrimmed(&existing.Description, input.Description)
		applyTrimmed(&existing.Status, input.Status)
		applyTrimmed(&existing.Priority, input.Priority)
		applyTrimmed(&existing.DueDate, input.DueDate)
		applyTrimmed(&existing.ScheduledDate, input.ScheduledDate)
		applyTrimmed(&existing.Color, input.Color)
		applyTrimmed(&existing.Folder, input.Folder)
		applyTrimmed(&existing.LinkedNoteID, input.LinkedNoteID)
		applyTrimmed(&existing.Recurrence, input.Recurrence)
		applyTrimmed(&existing.RecurrenceRule, input.RecurrenceRule)
		applyTrimmed(&existing.RecurrenceEnd, input.RecurrenceEnd)
		applyTrimmed(&existing.ParentID, input.ParentID)

		if input.Tags != nil {
			existing.Tags = nonNilStrings(*input.Tags)
		}
		if input.CompletedDates != nil {
			existing.CompletedDates = nonNilStrings(*input.CompletedDates)
		}
		if input.Safe != nil {
			existing.Safe = normalizeTodoSafe(*input.Safe)
		}
		if input.LinkedSafes != nil {
			existing.LinkedSafes = normalizeTodoLinkedSafes(*input.LinkedSafes)
		}
		if input.ShowInCalendar != nil {
			existing.ShowInCalendar = *input.ShowInCalendar
		}
		if input.IsArchived != nil {
			existing.IsArchived = *input.IsArchived
		}
		if input.SortOrder != nil {
			existing.SortOrder = *input.SortOrder
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
	}

	if err := h.Store.UpdateTodo(r.Context(), userID, existing); err != nil {
		writeTodoError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to update todo")
		return
	}

	broadcastTodo := existing
	if existing.IsEncrypted {
		broadcastTodo = redactTodoForExternalAPI(existing)
	}
	h.broadcastTodoEvent(userID, map[string]interface{}{
		"type":    "todo_updated",
		"todo_id": existing.ID,
		"todo":    broadcastTodo,
	})

	writeTodoJSON(w, http.StatusOK, existing)
}

// Delete handles DELETE /api/v1/todos/{id}.
func (h *TodosHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	todoID := chi.URLParam(r, "id")
	if strings.TrimSpace(todoID) == "" {
		writeTodoError(w, http.StatusBadRequest, "Bad Request", "Missing todo ID")
		return
	}

	if isAPITokenRequest(r) {
		existing, err := h.Store.GetTodoByID(r.Context(), userID, todoID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeTodoError(w, http.StatusNotFound, "Not Found", "Todo not found")
				return
			}
			writeTodoError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve todo")
			return
		}
		if existing.IsEncrypted {
			writeTodoJSON(w, http.StatusForbidden, map[string]interface{}{
				"error":     "Forbidden",
				"encrypted": true,
				"message":   "Cannot delete an end-to-end encrypted todo via external API",
			})
			return
		}
	}

	if err := h.Store.DeleteTodo(r.Context(), userID, todoID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeTodoError(w, http.StatusNotFound, "Not Found", "Todo not found")
			return
		}
		writeTodoError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete todo")
		return
	}

	h.broadcastTodoEvent(userID, map[string]interface{}{
		"type":    "todo_deleted",
		"todo_id": todoID,
	})

	w.WriteHeader(http.StatusNoContent)
}

const maxTodoSafeLen = 64
const maxTodoLinkedSafes = 20

// normalizeTodoSafe trims a workspace id. Empty and the legacy "Standard" name map to "main".
func normalizeTodoSafe(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" || s == "Standard" {
		return "main"
	}
	if len(s) > maxTodoSafeLen {
		s = s[:maxTodoSafeLen]
	}
	return s
}

// normalizeTodoLinkedSafes trims, de-duplicates and caps the extra workspaces a todo is shown in.
func normalizeTodoLinkedSafes(raw []string) []string {
	out := make([]string, 0, len(raw))
	seen := map[string]bool{}
	for _, r := range raw {
		s := normalizeTodoSafe(r)
		if seen[s] {
			continue
		}
		seen[s] = true
		out = append(out, s)
		if len(out) == maxTodoLinkedSafes {
			break
		}
	}
	return out
}
