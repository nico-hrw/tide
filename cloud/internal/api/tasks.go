package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type TaskHandler struct {
	Store store.Store
}

func NewTaskHandler(s store.Store) *TaskHandler {
	return &TaskHandler{Store: s}
}

func (h *TaskHandler) RegisterRoutes(r chi.Router) {
	r.Use(AuthMiddleware)

	r.Get("/", h.ListTasks)
	r.Post("/", h.CreateTask)
	r.Get("/{taskID}", h.GetTask)
	r.Put("/{taskID}", h.UpdateTask)
	r.Delete("/{taskID}", h.DeleteTask)
}

func (h *TaskHandler) ListTasks(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	tasks, err := h.Store.ListTasks(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to list tasks", http.StatusInternalServerError)
		return
	}

	if tasks == nil {
		tasks = make([]*db.Task, 0)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tasks)
}

type CreateTaskRequest struct {
	EncryptedVault []byte `json:"encrypted_vault"`
}

func (h *TaskHandler) CreateTask(w http.ResponseWriter, r *http.Request) {
	var req CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	task := &db.Task{
		ID:             uuid.New().String(),
		UserID:         userID,
		EncryptedVault: req.EncryptedVault,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if err := h.Store.CreateTask(r.Context(), task); err != nil {
		http.Error(w, "Failed to create task", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(task)
}

func (h *TaskHandler) GetTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "taskID")
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	task, err := h.Store.GetTask(r.Context(), id, userID)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Task not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to get task", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(task)
}

type UpdateTaskRequest struct {
	EncryptedVault []byte `json:"encrypted_vault"`
}

func (h *TaskHandler) UpdateTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "taskID")
	var req UpdateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	task, err := h.Store.GetTask(r.Context(), id, userID)
	if err != nil {
		http.Error(w, "Task not found", http.StatusNotFound)
		return
	}

	task.EncryptedVault = req.EncryptedVault
	task.UpdatedAt = time.Now()

	if err := h.Store.UpdateTask(r.Context(), task); err != nil {
		http.Error(w, "Failed to update task", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(task)
}

func (h *TaskHandler) DeleteTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "taskID")
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if err := h.Store.DeleteTask(r.Context(), id, userID); err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Task not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to delete task", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
