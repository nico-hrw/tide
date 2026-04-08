package api

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/store"
)

type ContactHandler struct {
	Store *store.SQLiteStore
}

func (h *ContactHandler) RegisterRoutes(r chi.Router) {
	r.Use(AuthMiddleware)
	r.Post("/request", h.SendRequest)
	r.Post("/{contactID}", h.SendRequest) // Allow direct POST to /{id} as frontend does
	r.Get("/requests", h.GetRequests)
	r.Post("/accept/{contactID}", h.AcceptRequest)
	r.Post("/decline/{contactID}", h.DeclineRequest)
	r.Delete("/{contactRowID}", h.DeleteContactByRowID)
	r.Post("/search", h.SearchUser)
	r.Get("/", h.ListContacts)
}

type ContactRequest struct {
	TargetID string `json:"target_id"`
}

type SearchRequest struct {
	Email string `json:"email"`
}

func (h *ContactHandler) SearchUser(w http.ResponseWriter, r *http.Request) {
	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// For MVP, since we use Blind Indexes (Hashes), we can only do EXACT search.
	// But the user asked for "similar" or "list".
	// To support "similar" with actual data, we would need to store plain email or use a searchable encryption.
	// HACK for MVP: We check for exact match, and if found, we return it in a LIST.
	// If the user wants to see "multiple", they can try different emails.

	emailHash := hashString(req.Email)
	user, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)

	type UserInfo struct {
		ID        string `json:"id"`
		Username  string `json:"username"`
		Email     string `json:"email"`
		PublicKey string `json:"public_key"`
	}
	results := []UserInfo{}

	if err == nil {
		results = append(results, UserInfo{
			ID:        user.ID,
			Username:  user.Username,
			Email:     "Hidden",
			PublicKey: user.PublicKey,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results)
}

func (h *ContactHandler) SendRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	targetID := chi.URLParam(r, "contactID")
	if targetID == "" {
		var req ContactRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			targetID = req.TargetID
		}
	}

	if targetID == "" {
		http.Error(w, "Target ID is required", http.StatusBadRequest)
		return
	}

	// Check if already friends or pending
	existing, _ := h.Store.GetContact(r.Context(), userID, targetID)
	if existing != nil {
		http.Error(w, "Contact already exists or pending", http.StatusConflict)
		return
	}

	contact := &store.Contact{
		ID:        uuid.New().String(),
		UserID:    userID,
		ContactID: targetID,
		Status:    "pending",
		CreatedAt: time.Now(),
	}

	if err := h.Store.CreateContact(r.Context(), contact); err != nil {
		http.Error(w, "Failed to create request", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

func (h *ContactHandler) GetRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	requests, err := h.Store.GetContactRequests(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to fetch requests", http.StatusInternalServerError)
		return
	}

	// Flatten response for frontend expectations
	type FlatRequest struct {
		ID         string    `json:"id"`
		UserID     string    `json:"user_id"`
		Username   string    `json:"username"`
		AvatarSeed string    `json:"avatar_seed"`
		AvatarSalt string    `json:"avatar_salt"`
		AvatarStyle string   `json:"avatar_style"`
		CreatedAt  time.Time `json:"created_at"`
	}

	flat := []FlatRequest{}
	for _, req := range requests {
		// req.UserID is the ONE WHO SENT the request
		user, err := h.Store.GetUser(r.Context(), req.UserID)
		if err != nil {
			continue
		}
		
		profile, _ := h.Store.GetProfile(r.Context(), req.UserID)
		avatarSeed := user.Username // Default to username for better avatar than UUID
		avatarStyle := "notionists"
		avatarSalt := ""
		if profile != nil {
			if profile.AvatarSeed != "" {
				avatarSeed = profile.AvatarSeed
			}
			if profile.AvatarStyle != "" {
				avatarStyle = profile.AvatarStyle
			}
			if profile.AvatarSalt != "" {
				avatarSalt = profile.AvatarSalt
			}
		}

		flat = append(flat, FlatRequest{
			ID:         req.ID,
			UserID:     user.ID,
			Username:   user.Username,
			AvatarSeed: avatarSeed,
			AvatarSalt: avatarSalt,
			AvatarStyle: avatarStyle,
			CreatedAt:  req.CreatedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(flat)
}

func (h *ContactHandler) AcceptRequest(w http.ResponseWriter, r *http.Request) {
	contactID := chi.URLParam(r, "contactID")
	if err := h.Store.AcceptContact(r.Context(), contactID); err != nil {
		http.Error(w, "Failed to accept", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *ContactHandler) DeclineRequest(w http.ResponseWriter, r *http.Request) {
	contactID := chi.URLParam(r, "contactID")
	if err := h.Store.DeleteContact(r.Context(), contactID); err != nil {
		http.Error(w, "Failed to decline", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}

func (h *ContactHandler) ListContacts(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	contacts, err := h.Store.GetContacts(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to fetch contacts", http.StatusInternalServerError)
		return
	}

	// Enrich
	type EnrichedContact struct {
		ID      string `json:"contact_row_id"`
		Status  string `json:"status"`
		Partner struct {
			ID          string `json:"id"`
			Username    string `json:"username"`
			Email       string `json:"email"`
			PublicKey   string `json:"public_key"`
			AvatarSeed  string `json:"avatar_seed"`
			AvatarSalt  string `json:"avatar_salt"`
			AvatarStyle string `json:"avatar_style"`
		} `json:"partner"`
	}

	enriched := []EnrichedContact{}
	for _, c := range contacts {
		partnerID := c.ContactID
		if partnerID == userID {
			partnerID = c.UserID
		}

		user, err := h.Store.GetUser(r.Context(), partnerID)
		if err != nil {
			continue
		}

		profile, _ := h.Store.GetProfile(r.Context(), partnerID)
		avatarSeed := partnerID
		avatarSalt := ""
		avatarStyle := "notionists"
		if profile != nil {
			if profile.AvatarSeed != "" {
				avatarSeed = profile.AvatarSeed
			}
			avatarSalt = profile.AvatarSalt
			if profile.AvatarStyle != "" {
				avatarStyle = profile.AvatarStyle
			}
		}

		enriched = append(enriched, EnrichedContact{
			ID:     c.ID,
			Status: c.Status,
			Partner: struct {
				ID          string `json:"id"`
				Username    string `json:"username"`
				Email       string `json:"email"`
				PublicKey   string `json:"public_key"`
				AvatarSeed  string `json:"avatar_seed"`
				AvatarSalt  string `json:"avatar_salt"`
				AvatarStyle string `json:"avatar_style"`
			}{
				ID:          user.ID,
				Username:    user.Username,
				Email:       "Hidden",
				PublicKey:   user.PublicKey,
				AvatarSeed:  avatarSeed,
				AvatarSalt:  avatarSalt,
				AvatarStyle: avatarStyle,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(enriched)
}

func (h *ContactHandler) DeleteContactByRowID(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	contactRowID := chi.URLParam(r, "contactRowID")
	if err := h.Store.DeleteContact(r.Context(), contactRowID); err != nil {
		http.Error(w, "Failed to delete contact", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusOK)
}
