package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/store"
)

type MessageHandler struct {
	Store  store.Store
	Broker *Broker
}

func (h *MessageHandler) RegisterRoutes(r chi.Router) {
	r.Post("/", h.SendMessage)
	r.Get("/", h.GetMessages)
	r.Get("/conversations", h.ListConversations)
	r.Patch("/{messageID}", h.UpdateMessageStatus)
	r.Delete("/conversation", h.DeleteConversation)
}

func (h *MessageHandler) DeleteConversation(w http.ResponseWriter, r *http.Request) {
	senderID := r.Header.Get("X-User-ID")
	if senderID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	partnerEmail := r.URL.Query().Get("partner_email")
	if partnerEmail == "" {
		http.Error(w, "Missing partner_email", http.StatusBadRequest)
		return
	}

	emailHash := hashString(partnerEmail)
	partner, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		http.Error(w, "Partner not found", http.StatusNotFound)
		return
	}

	if err := h.Store.DeleteConversation(r.Context(), senderID, partner.ID); err != nil {
		http.Error(w, "Failed to delete conversation", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

type SendMessageRequest struct {
	RecipientEmail string `json:"recipient_email"`
	Content        string `json:"content"`
}

func (h *MessageHandler) SendMessage(w http.ResponseWriter, r *http.Request) {
	// ... (existing logic) ...
	senderID := r.Header.Get("X-User-ID")
	if senderID == "" {
		senderID = "user-1"
	}

	var req SendMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	emailHash := hashString(req.RecipientEmail)
	recipient, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		http.Error(w, "Recipient not found", http.StatusNotFound)
		return
	}

	contact, _ := h.Store.GetContact(r.Context(), senderID, recipient.ID) // Store Interface Update? Store.GetContact(ctx, from, to)

	// Check if this is a system message (file share, event share, etc.)
	// System messages should be allowed even without friendship
	var contentData map[string]interface{}
	isSystemMessage := false
	if err := json.Unmarshal([]byte(req.Content), &contentData); err == nil {
		if msgType, ok := contentData["type"].(string); ok {
			isSystemMessage = msgType == "file_share_request" || msgType == "event_share"
		}
	}

	if !isSystemMessage && (contact == nil || contact.Status != "accepted") {
		http.Error(w, "You must be friends to message each other", http.StatusForbidden)
		return
	}

	msg := &store.Message{
		ID:          uuid.New().String(),
		SenderID:    senderID,
		RecipientID: recipient.ID,
		Content:     req.Content,
		Status:      "pending",
		CreatedAt:   time.Now(),
	}

	if err := h.Store.CreateMessage(r.Context(), msg); err != nil {
		http.Error(w, "Failed to send", http.StatusInternalServerError)
		return
	}

	// Broadcast Event
	// Broadcast Event
	if h.Broker != nil {
		msgBytes, _ := json.Marshal(msg)
		eventData := fmt.Sprintf(`{"type":"new_message","message":%s}`, string(msgBytes))
		// Send to recipient
		h.Broker.Broadcast(recipient.ID, eventData)
		// Send to sender (for multi-tab sync)
		h.Broker.Broadcast(senderID, eventData)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msg)
}

func (h *MessageHandler) GetMessages(w http.ResponseWriter, r *http.Request) {
	senderID := r.Header.Get("X-User-ID")
	if senderID == "" {
		senderID = "user-1"
	}

	partnerEmail := r.URL.Query().Get("partner_email")
	if partnerEmail == "" {
		http.Error(w, "Missing partner_email", http.StatusBadRequest)
		return
	}

	emailHash := hashString(partnerEmail)
	partner, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		http.Error(w, "Partner not found", http.StatusNotFound)
		return
	}

	// Check friendship - RELAXED for system messages / existing chats
	// If we enforced strict "accepted" here, users couldn't see file share requests
	// from people they haven't "friended" yet.
	// We rely on the fact that if they have messages (which CreateMessage allowed), they can read them.
	// contact, _ := h.Store.GetContact(r.Context(), senderID, partner.ID)
	// if contact == nil || contact.Status != "accepted" { ... } -> Removed strict check

	// Optional: We could check if contact exists at all?
	// But valid system messages might exist even if contact row is pending or nil?
	// (Actually CreateMessage ensures contact check/creation? No, CreateMessage for system message skips it)
	// So we should just proceed to fetch messages.

	msgs, err := h.Store.GetMessages(r.Context(), senderID, partner.ID)
	if err != nil {
		http.Error(w, "Failed to fetch messages", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(msgs)
}

type UpdateMessageStatusRequest struct {
	Status string `json:"status"`
}

func (h *MessageHandler) UpdateMessageStatus(w http.ResponseWriter, r *http.Request) {
	msgID := chi.URLParam(r, "messageID")
	userID := r.Header.Get("X-User-ID")

	var req UpdateMessageStatusRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// Permission: Only the recipient should be able to update status (Accept/Decline)
	// For "accepted", maybe sender too? For now, simple check.
	msg, err := h.Store.GetMessage(r.Context(), msgID)
	if err != nil {
		http.Error(w, "Message not found", http.StatusNotFound)
		return
	}

	if msg.RecipientID != userID && msg.SenderID != userID {
		http.Error(w, "Unauthorized", http.StatusForbidden)
		return
	}

	if err := h.Store.UpdateMessageStatus(r.Context(), msgID, req.Status); err != nil {
		http.Error(w, "Failed to update status", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *MessageHandler) ListConversations(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	users, err := h.Store.GetConversations(r.Context(), userID)
	if err != nil {
		http.Error(w, "Failed to fetch conversations", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}
