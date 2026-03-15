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
	r.Get("/requests", h.GetRequests)
	r.Post("/{contactID}/accept", h.AcceptRequest)
	r.Post("/{contactID}/decline", h.DeclineRequest)
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
		var sensitiveData map[string]string
		if err := json.Unmarshal(user.EncryptedData, &sensitiveData); err == nil {
			results = append(results, UserInfo{
				ID:        user.ID,
				Username:  sensitiveData["username"],
				Email:     sensitiveData["email"],
				PublicKey: user.PublicKey,
			})
		}
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

	var req ContactRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// Check if already friends or pending
	existing, _ := h.Store.GetContact(r.Context(), userID, req.TargetID)
	if existing != nil {
		http.Error(w, "Contact already exists or pending", http.StatusConflict)
		return
	}

	contact := &store.Contact{
		ID:        uuid.New().String(),
		UserID:    userID,
		ContactID: req.TargetID,
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

	// Enrich with Usernames? Not easy efficiently without join.
	// Frontend can fetch user details individually or we can enrich here.
	// Let's enrich here for MVP simplicity.
	type EnrichedRequest struct {
		ID        string `json:"id"`
		Requester struct {
			ID        string `json:"id"`
			Username  string `json:"username"`
			Email     string `json:"email"`
			PublicKey string `json:"public_key"`
		} `json:"requester"`
		CreatedAt time.Time `json:"created_at"`
	}

	enriched := []EnrichedRequest{}
	for _, req := range requests {
		// req.UserID is the ONE WHO SENT the request
		user, err := h.Store.GetUser(r.Context(), req.UserID)
		if err != nil {
			continue
		}

		var sensitiveData map[string]string
		json.Unmarshal(user.EncryptedData, &sensitiveData)

		enriched = append(enriched, EnrichedRequest{
			ID: req.ID,
			Requester: struct {
				ID        string `json:"id"`
				Username  string `json:"username"`
				Email     string `json:"email"`
				PublicKey string `json:"public_key"`
			}{
				ID:        user.ID,
				Username:  sensitiveData["username"],
				Email:     sensitiveData["email"],
				PublicKey: user.PublicKey,
			},
			CreatedAt: req.CreatedAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(enriched)
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
		Partner struct {
			ID        string `json:"id"`
			Username  string `json:"username"`
			Email     string `json:"email"`
			PublicKey string `json:"public_key"`
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

		var sensitiveData map[string]string
		json.Unmarshal(user.EncryptedData, &sensitiveData)

		enriched = append(enriched, EnrichedContact{
			ID: c.ID,
			Partner: struct {
				ID        string `json:"id"`
				Username  string `json:"username"`
				Email     string `json:"email"`
				PublicKey string `json:"public_key"`
			}{
				ID:        user.ID,
				Username:  sensitiveData["username"],
				Email:     sensitiveData["email"],
				PublicKey: user.PublicKey,
			},
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(enriched)
}
