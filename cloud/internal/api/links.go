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
	r.Get("/", h.ListLinks)
	r.Post("/", h.CreateLink)
	r.Delete("/", h.DeleteLink)
}

// ListLinks: GET /api/v1/links?source_id=... OR ?target_id=...
func (h *LinkHandler) ListLinks(w http.ResponseWriter, r *http.Request) {
	sourceID := r.URL.Query().Get("source_id")
	targetID := r.URL.Query().Get("target_id")

	var links []db.Link
	var err error

	if sourceID != "" {
		links, err = h.Store.GetOutlinks(r.Context(), sourceID)
	} else if targetID != "" {
		links, err = h.Store.GetBacklinks(r.Context(), targetID)
	} else {
		http.Error(w, "Missing source_id or target_id", http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, "Failed to list links", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(links)
}

type CreateLinkRequest struct {
	SourceID string      `json:"source_id"`
	TargetID string      `json:"target_id"`
	Type     db.LinkType `json:"type"` // Optional, default manual
}

func (h *LinkHandler) CreateLink(w http.ResponseWriter, r *http.Request) {
	var req CreateLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.SourceID == "" || req.TargetID == "" {
		http.Error(w, "Missing source_id or target_id", http.StatusBadRequest)
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
	var req DeleteLinkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.SourceID == "" || req.TargetID == "" {
		http.Error(w, "Missing source_id or target_id", http.StatusBadRequest)
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
