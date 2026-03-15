package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/store"
)

// Tab represents the lightweight structure of an open tab sent by the client
type Tab struct {
	ID    string `json:"id"`
	Type  string `json:"type"`
	Title string `json:"title"`
}

type TabsHandler struct {
	Store *store.SQLiteStore
}

func NewTabsHandler(s *store.SQLiteStore) *TabsHandler {
	return &TabsHandler{Store: s}
}

func (h *TabsHandler) RegisterRoutes(r chi.Router) {
	r.Use(AuthMiddleware)
	r.Post("/validate", h.ValidateTabs)
}

func (h *TabsHandler) ValidateTabs(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var reqTabs []Tab
	if err := json.NewDecoder(r.Body).Decode(&reqTabs); err != nil {
		http.Error(w, "Invalid Payload", http.StatusBadRequest)
		return
	}

	validTabs := make([]Tab, 0)

	// Pre-fetch user extensions for 'ext_*' checks
	extList, err := h.Store.GetUserExtensions(r.Context(), userID)
	extMap := make(map[string]bool)
	if err == nil && extList != nil {
		for _, e := range extList {
			extMap[e] = true
		}
	}

	for _, tab := range reqTabs {
		if tab.Type == "calendar" {
			validTabs = append(validTabs, tab)
			continue
		}

		if tab.Type == "messages" {
			validTabs = append(validTabs, tab)
			continue
		}

		if tab.Type == "chat" {
			validTabs = append(validTabs, tab)
			continue
		}

		if tab.Type == "ext_finance" {
			if extMap["finance"] {
				validTabs = append(validTabs, tab)
			}
			continue
		}

		if tab.Type == "file" {
			// Verify access to file (must be owner, or have shared access)
			hasAccess, err := h.Store.UserHasFileAccess(r.Context(), userID, tab.ID)
			if err == nil && hasAccess {
				validTabs = append(validTabs, tab)
			}
			continue
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if len(validTabs) == 0 {
		w.Write([]byte("[]"))
		return
	}
	json.NewEncoder(w).Encode(validTabs)
}
