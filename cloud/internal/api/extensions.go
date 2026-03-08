package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/store"
)

type ExtensionsHandler struct {
	Store *store.SQLiteStore
}

func NewExtensionsHandler(s *store.SQLiteStore) *ExtensionsHandler {
	return &ExtensionsHandler{Store: s}
}

func (h *ExtensionsHandler) RegisterRoutes(r chi.Router) {
	r.Put("/", h.ToggleExtension)
	r.Get("/", h.GetExtensions)
}

func (h *ExtensionsHandler) GetExtensions(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	user, err := h.Store.GetUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	var extensions []string
	if len(user.EnabledExtensions) > 0 {
		json.Unmarshal(user.EnabledExtensions, &extensions)
	} else {
		extensions = []string{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"enabled_extensions": extensions,
	})
}

type ToggleExtensionRequest struct {
	Extension string `json:"extension"`
	Enabled   bool   `json:"enabled"`
}

func (h *ExtensionsHandler) ToggleExtension(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req ToggleExtensionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Validate that extension ID is not empty
	if req.Extension == "" {
		http.Error(w, "Extension ID required", http.StatusBadRequest)
		return
	}

	// Fetch current user details
	user, err := h.Store.GetUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	var extensions []string
	if len(user.EnabledExtensions) > 0 {
		if err := json.Unmarshal(user.EnabledExtensions, &extensions); err != nil {
			// If corrupted, reset to empty
			extensions = []string{}
		}
	} else {
		extensions = []string{}
	}

	var updated []string

	// Copy existing, ignoring the one we're toggling
	for _, ext := range extensions {
		if ext != req.Extension {
			updated = append(updated, ext)
		}
	}

	if req.Enabled {
		updated = append(updated, req.Extension)
	}

	// Save back
	updatedBytes, err := json.Marshal(updated)
	if err != nil {
		http.Error(w, "Internal error", http.StatusInternalServerError)
		return
	}

	if err := h.Store.UpdateUserExtensions(r.Context(), userID, updatedBytes); err != nil {
		http.Error(w, "Failed to update extensions", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"enabled_extensions": updated,
	})
}
