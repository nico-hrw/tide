package api

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
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

type ExternalHandler struct {
	Store *store.SQLiteStore
}

func NewExternalHandler(s *store.SQLiteStore) *ExternalHandler {
	return &ExternalHandler{Store: s}
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
				if sc == "*" {
					hasScope = true
					break
				}
				for _, req := range requiredScopes {
					if sc == req {
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
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]interface{}{
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

// --- Notes API ---

type CreateExternalNoteRequest struct {
	Title    string  `json:"title"`
	Content  string  `json:"content"`
	ParentID *string `json:"parent_id"`
}

type UpdateExternalNoteRequest struct {
	Title    *string `json:"title"`
	Content  *string `json:"content"`
	ParentID *string `json:"parent_id"`
}

func (h *ExternalHandler) ListNotes(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	q := r.URL.Query()
	search := q.Get("search")
	if search == "" {
		search = q.Get("q")
	}

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

	notes, err := h.Store.ListNotesForExternalAPI(r.Context(), userID, search, limit)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error":   "Internal Server Error",
			"message": "Failed to retrieve notes",
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count": len(notes),
		"notes": notes,
	})
}

func (h *ExternalHandler) GetNote(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	noteID := chi.URLParam(r, "id")
	if noteID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Bad Request", "message": "Missing note ID"})
		return
	}

	note, err := h.Store.GetNoteForExternalAPI(r.Context(), userID, noteID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Not Found", "message": "Note not found"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Internal Server Error", "message": "Failed to retrieve note"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         note.ID,
		"title":      note.Title,
		"content":    note.Content,
		"parent_id":  note.ParentID,
		"created_at": note.CreatedAt,
		"updated_at": note.UpdatedAt,
		"note":       note,
	})
}

func (h *ExternalHandler) CreateNote(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateExternalNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Bad Request", "message": "Invalid request body"})
		return
	}

	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Untitled Note"
	}

	var parentID *string
	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		cleanParentID := strings.TrimSpace(*req.ParentID)
		parentFile, err := h.Store.GetAccessibleFile(r.Context(), cleanParentID, userID)
		if err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Bad Request", "message": "Parent not found or access denied"})
			return
		}
		if !store.CanWrite(parentFile.Permission) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden", "message": "Write permission required on parent"})
			return
		}
		parentID = &cleanParentID
	}

	now := time.Now().UTC()
	fileID := uuid.New().String()
	contentBytes := []byte(req.Content)

	metaMap := map[string]interface{}{"title": title}
	metaBytes, _ := json.Marshal(metaMap)

	file := &db.File{
		ID:         fileID,
		OwnerID:    userID,
		ParentID:   parentID,
		Type:       db.FileTypeNote,
		Size:       int64(len(contentBytes)),
		CreatedAt:  now,
		UpdatedAt:  now,
		Visibility: "private",
		Metadata:   metaBytes,
		PublicMeta: metaBytes,
		Version:    1,
		Content:    contentBytes,
	}

	if err := h.Store.CreateFile(r.Context(), file); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Internal Server Error", "message": "Failed to create note"})
		return
	}

	createdNote := &db.ExternalNote{
		ID:        fileID,
		Title:     title,
		Content:   req.Content,
		ParentID:  parentID,
		CreatedAt: now,
		UpdatedAt: now,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         createdNote.ID,
		"title":      createdNote.Title,
		"content":    createdNote.Content,
		"parent_id":  createdNote.ParentID,
		"created_at": createdNote.CreatedAt,
		"updated_at": createdNote.UpdatedAt,
		"note":       createdNote,
	})
}

func (h *ExternalHandler) UpdateNote(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	noteID := chi.URLParam(r, "id")
	if noteID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Bad Request", "message": "Missing note ID"})
		return
	}

	file, err := h.Store.GetAccessibleFile(r.Context(), noteID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Not Found", "message": "Note not found"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Internal Server Error", "message": "Failed to retrieve note"})
		return
	}

	if file.Type != db.FileTypeNote {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Not Found", "message": "Note not found"})
		return
	}

	if !store.CanWrite(file.Permission) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden", "message": "Write permission required"})
		return
	}

	var req UpdateExternalNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Bad Request", "message": "Invalid request body"})
		return
	}

	if req.Title != nil {
		var metaMap map[string]interface{}
		if len(file.Metadata) > 0 {
			_ = json.Unmarshal(file.Metadata, &metaMap)
		}
		if metaMap == nil {
			metaMap = make(map[string]interface{})
		}
		metaMap["title"] = *req.Title
		metaBytes, _ := json.Marshal(metaMap)
		file.Metadata = metaBytes
		file.PublicMeta = metaBytes
	}

	if req.Content != nil {
		file.Content = []byte(*req.Content)
		file.Size = int64(len(file.Content))
	}

	if req.ParentID != nil {
		if strings.TrimSpace(*req.ParentID) == "" {
			file.ParentID = nil
		} else {
			cleanParentID := strings.TrimSpace(*req.ParentID)
			parentFile, err := h.Store.GetAccessibleFile(r.Context(), cleanParentID, userID)
			if err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{"error": "Bad Request", "message": "Parent not found or access denied"})
				return
			}
			if !store.CanWrite(parentFile.Permission) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusForbidden)
				json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden", "message": "Write permission required on parent"})
				return
			}
			file.ParentID = &cleanParentID
		}
	}

	file.UpdatedAt = time.Now().UTC()

	if err := h.Store.UpdateFile(r.Context(), file); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Internal Server Error", "message": "Failed to update note"})
		return
	}

	updatedNote, err := h.Store.GetNoteForExternalAPI(r.Context(), userID, noteID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true,
			"id":      noteID,
		})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         updatedNote.ID,
		"title":      updatedNote.Title,
		"content":    updatedNote.Content,
		"parent_id":  updatedNote.ParentID,
		"created_at": updatedNote.CreatedAt,
		"updated_at": updatedNote.UpdatedAt,
		"note":       updatedNote,
	})
}

func (h *ExternalHandler) DeleteNote(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	noteID := chi.URLParam(r, "id")
	if noteID == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Bad Request", "message": "Missing note ID"})
		return
	}

	file, err := h.Store.GetAccessibleFile(r.Context(), noteID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "Not Found", "message": "Note not found"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Internal Server Error", "message": "Failed to retrieve note"})
		return
	}

	if file.Type != db.FileTypeNote {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Not Found", "message": "Note not found"})
		return
	}

	if !store.CanWrite(file.Permission) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		json.NewEncoder(w).Encode(map[string]string{"error": "Forbidden", "message": "Write permission required"})
		return
	}

	if err := h.Store.DeleteFile(r.Context(), noteID); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": "Internal Server Error", "message": "Failed to delete note"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"message": "Note deleted successfully",
		"id":      noteID,
	})
}
