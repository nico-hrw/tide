package api

import (
	"encoding/json"
	"net/http"
)

type PresenceHandler struct {
	Broker *Broker
}

type UpdateStatusRequest struct {
	Status string `json:"status"`
}

func (h *PresenceHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req UpdateStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Normalize status
	status := req.Status
	if status != "online" && status != "away" && status != "offline" {
		status = "online"
	}

	if h.Broker != nil {
		h.Broker.SetUserStatus(userID, status)
		h.Broker.BroadcastPresence(userID, status)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"status":  status,
	})
}

func (h *PresenceHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	var req UpdateStatusRequest
	_ = json.NewDecoder(r.Body).Decode(&req) // optional body

	if h.Broker != nil {
		h.Broker.TouchUser(userID)
		if req.Status == "online" || req.Status == "away" || req.Status == "offline" {
			h.Broker.SetUserStatus(userID, req.Status)
			// Only broadcast if status is changing or needed
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}
