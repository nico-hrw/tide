package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type ProfileHandler struct {
	Store store.Store
}

func (h *ProfileHandler) RegisterRoutes(r chi.Router) {
	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(AuthMiddleware)
		r.Get("/search", h.Search)
		r.Get("/suggestions", h.Suggestions)
		r.Put("/", h.UpsertProfile)
	})
	
	r.Get("/{userID}", h.GetProfile)
}

func (h *ProfileHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	if userID == "" {
		http.Error(w, "User ID is required", http.StatusBadRequest)
		return
	}

	profile, err := h.Store.GetProfile(r.Context(), userID)
	if err != nil && err != store.ErrNotFound {
		http.Error(w, "Failed to fetch profile", http.StatusInternalServerError)
		return
	}

	user, err := h.Store.GetUser(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to fetch user", http.StatusInternalServerError)
		return
	}

	type EnrichedProfile struct {
		db.Profile
		Username   string `json:"username"`
		IsVerified bool   `json:"is_verified"`
	}

	var res EnrichedProfile
	if profile != nil {
		res.Profile = *profile
	} else {
		res.UserID = userID
		res.AvatarSeed = userID
	}
	res.Username = user.Username
	res.IsVerified = user.IsVerified

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

func (h *ProfileHandler) UpsertProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req db.Profile
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// Override user ID with the authenticated one to prevent hijacking
	req.UserID = userID

	if err := h.Store.UpsertProfile(r.Context(), &req); err != nil {
		http.Error(w, "Failed to save profile", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *ProfileHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "Query parameter 'q' is required", http.StatusBadRequest)
		return
	}

	userID, _ := r.Context().Value("user_id").(string)
	results, err := h.Store.SearchPublicData(r.Context(), query, userID)
	if err != nil {
		http.Error(w, "Search failed", http.StatusInternalServerError)
		return
	}

	if results == nil {
		results = []*db.SearchResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
func (h *ProfileHandler) Suggestions(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value("user_id").(string)
	results, err := h.Store.GetRandomProfiles(r.Context(), 6, userID) // Increase limit to 6
	if err != nil {
		http.Error(w, "Failed to fetch suggestions", http.StatusInternalServerError)
		return
	}

	if results == nil {
		results = []*db.SearchResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}
