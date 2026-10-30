package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type LinkHandler struct {
	Store *store.SQLiteStore
}

func NewLinkHandler(s *store.SQLiteStore) *LinkHandler {
	return &LinkHandler{Store: s}
}

func (h *LinkHandler) RegisterRoutes(r chi.Router) {
	r.Use(AuthMiddleware)
	r.Get("/", h.ListLinks)
	r.Post("/", h.CreateLink)
	r.Delete("/", h.DeleteLink)
}

// ListLinks: GET /api/v1/links?source_id=... OR ?target_id=...
func (h *LinkHandler) ListLinks(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	sourceID := r.URL.Query().Get("source_id")
	targetID := r.URL.Query().Get("target_id")

	var rawLinks []db.Link
	var err error

	if sourceID != "" {
		if _, err := h.Store.GetAccessibleFile(r.Context(), sourceID, userID); err != nil {
			http.Error(w, "File not found or access denied", http.StatusNotFound)
			return
		}
		rawLinks, err = h.Store.GetOutlinks(r.Context(), sourceID)
	} else if targetID != "" {
		if _, err := h.Store.GetAccessibleFile(r.Context(), targetID, userID); err != nil {
			http.Error(w, "File not found or access denied", http.StatusNotFound)
			return
		}
		rawLinks, err = h.Store.GetBacklinks(r.Context(), targetID)
	} else {
		http.Error(w, "Missing source_id or target_id", http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, "Failed to list links", http.StatusInternalServerError)
		return
	}

	accessibleLinks := make([]db.Link, 0)
	for _, l := range rawLinks {
		if sourceID != "" {
			if _, err := h.Store.GetAccessibleFile(r.Context(), l.TargetID, userID); err == nil {
				accessibleLinks = append(accessibleLinks, l)
			}
		} else {
			if _, err := h.Store.GetAccessibleFile(r.Context(), l.SourceID, userID); err == nil {
				accessibleLinks = append(accessibleLinks, l)
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(accessibleLinks)
}

type CreateLinkRequest struct {
	SourceID string      `json:"source_id"`
	TargetID string      `json:"target_id"`
	Type     db.LinkType `json:"type"` // Optional, default manual
}

func (h *LinkHandler) CreateLink(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req CreateLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.SourceID == "" || req.TargetID == "" {
		http.Error(w, "Missing source_id or target_id", http.StatusBadRequest)
		return
	}

	// Verify user has access to source and target
	sourceFile, err := h.Store.GetAccessibleFile(r.Context(), req.SourceID, userID)
	if err != nil {
		http.Error(w, "Source file not found or access denied", http.StatusNotFound)
		return
	}
	if !store.CanWrite(sourceFile.Permission) {
		http.Error(w, "Forbidden: write permission required on source file", http.StatusForbidden)
		return
	}
	if _, err := h.Store.GetAccessibleFile(r.Context(), req.TargetID, userID); err != nil {
		http.Error(w, "Target file not found or access denied", http.StatusNotFound)
		return
	}

	if req.Type == "" {
		req.Type = db.LinkTypeManual
	}

	link := db.Link{
		SourceID:  req.SourceID,
		TargetID:  req.TargetID,
		Type:      req.Type,
		CreatedAt: time.Now(),
	}

	if err := h.Store.CreateLink(r.Context(), link); err != nil {
		if err == store.ErrConflict {
			http.Error(w, "Link already exists", http.StatusConflict)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

type DeleteLinkRequest struct {
	SourceID string `json:"source_id"`
	TargetID string `json:"target_id"`
}

func (h *LinkHandler) DeleteLink(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req DeleteLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.SourceID == "" || req.TargetID == "" {
		http.Error(w, "Missing source_id or target_id", http.StatusBadRequest)
		return
	}

	sourceFile, err := h.Store.GetAccessibleFile(r.Context(), req.SourceID, userID)
	if err != nil {
		http.Error(w, "Source file not found or access denied", http.StatusNotFound)
		return
	}
	if !store.CanWrite(sourceFile.Permission) {
		http.Error(w, "Forbidden: write permission required on source file", http.StatusForbidden)
		return
	}

	if err := h.Store.DeleteLink(r.Context(), req.SourceID, req.TargetID); err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Link not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
