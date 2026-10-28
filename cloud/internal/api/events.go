package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
)

// Broker handles SSE connections and broadcasting
type Broker struct {
	// Map of Client Channel -> UserID (or just set of clients)
	clients map[chan string]string

	// Channel to add new clients
	newClients chan clientReq

	// Channel to remove clients
	closedClients chan chan string

	// Channel to broadcast messages
	messages chan messageEvent

	// User status tracking
	userStatus map[string]string
	lastSeen   map[string]time.Time

	// Mutex for clients map safety
	mu sync.RWMutex
}

type clientReq struct {
	msgChan chan string
	userID  string
}

type messageEvent struct {
	TargetUserID string
	Data         string
}

func NewBroker() *Broker {
	broker := &Broker{
		clients:       make(map[chan string]string),
		newClients:    make(chan clientReq),
		closedClients: make(chan chan string),
		messages:      make(chan messageEvent),
		userStatus:    make(map[string]string),
		lastSeen:      make(map[string]time.Time),
	}
	go broker.listen()
	go broker.reaper()
	return broker
}

func makeStatusPayload(userID, status string) string {
	payload, err := json.Marshal(map[string]any{
		"type": "user_status_changed",
		"payload": map[string]any{
			"user_id": userID,
			"status":  status,
		},
	})
	if err != nil {
		return ""
	}
	return string(payload)
}

func (b *Broker) broadcastLocked(data string) {
	if data == "" {
		return
	}
	for clientChan := range b.clients {
		select {
		case clientChan <- data:
		default:
		}
	}
}

func (b *Broker) listen() {
	for {
		select {
		// Add new client
		case req := <-b.newClients:
			b.mu.Lock()
			activeChannels := 0
			for _, uid := range b.clients {
				if uid == req.userID {
					activeChannels++
				}
			}
			b.clients[req.msgChan] = req.userID
			if activeChannels == 0 {
				st := b.userStatus[req.userID]
				if st == "" || st == "offline" {
					st = "online"
				}
				b.userStatus[req.userID] = st
				b.lastSeen[req.userID] = time.Now()
				b.broadcastLocked(makeStatusPayload(req.userID, st))
			}
			b.mu.Unlock()
			log.Printf("Client connected: %s", req.userID)

		// Remove client
		case s := <-b.closedClients:
			b.mu.Lock()
			userID := b.clients[s]
			delete(b.clients, s)
			close(s)

			if userID != "" {
				hasRemaining := false
				for _, uid := range b.clients {
					if uid == userID {
						hasRemaining = true
						break
					}
				}
				if !hasRemaining {
					b.lastSeen[userID] = time.Now()
					b.userStatus[userID] = "offline"
					b.broadcastLocked(makeStatusPayload(userID, "offline"))
				}
			}
			b.mu.Unlock()
			log.Printf("Client disconnected")

		// Broadcast message
		case event := <-b.messages:
			b.mu.RLock()
			for clientChan, userID := range b.clients {
				// Only send if userID matches target
				if event.TargetUserID == "" || userID == event.TargetUserID {
					select {
					case clientChan <- event.Data:
					default:
						// If client is blocked, skip or disconnect?
						// For SSE, skipping might result in lost events.
						// MVP: Skip.
					}
				}
			}
			b.mu.RUnlock()
		}
	}
}

func (b *Broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// [FIX MITTEL-2] user_id MUST come from the JWT context set by AuthMiddleware.
	// The previous query-param fallback (?user_id=...) was an authentication bypass:
	// any caller could impersonate any user_id without a valid token.
	// Since this route is registered with r.With(api.AuthMiddleware), the context
	// value is always populated for authenticated requests.
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	// Disable read/write timeouts for this connection
	rc := http.NewResponseController(w)
	if rc != nil {
		rc.SetReadDeadline(time.Time{})
		rc.SetWriteDeadline(time.Time{})
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("X-Accel-Buffering", "no")

	// Create a channel for this client
	messageChan := make(chan string)

	// Register client
	b.newClients <- clientReq{msgChan: messageChan, userID: userID}

	// Send an initial ping to establish connection immediately
	fmt.Fprintf(w, ": connection established\n\n")
	flusher.Flush()

	// Listen for closing connection
	notify := r.Context().Done()

	go func() {
		<-notify
		b.closedClients <- messageChan
	}()

	// Ping ticker for Keep-Alive
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case msg, open := <-messageChan:
			if !open {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-ticker.C:
			// Send a comment ping to keep the connection alive
			fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}

func (b *Broker) Broadcast(targetUserID, data string) {
	b.messages <- messageEvent{TargetUserID: targetUserID, Data: data}
}

func (b *Broker) BroadcastAll(data string) {
	b.messages <- messageEvent{TargetUserID: "", Data: data}
}

func (b *Broker) SetUserStatus(userID string, status string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.userStatus[userID] = status
	b.lastSeen[userID] = time.Now()
}

func (b *Broker) GetUserStatus(userID string) string {
	b.mu.RLock()
	defer b.mu.RUnlock()

	if b.userStatus[userID] == "offline" {
		return "offline"
	}

	hasActive := false
	for _, uid := range b.clients {
		if uid == userID {
			hasActive = true
			break
		}
	}

	st := b.userStatus[userID]
	if st == "" {
		st = "online"
	}

	if hasActive {
		return st
	}

	if last, ok := b.lastSeen[userID]; ok && !last.IsZero() && time.Since(last) < 2*time.Minute {
		return st
	}

	return "offline"
}

func (b *Broker) TouchUser(userID string) {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.lastSeen[userID] = time.Now()
}

func (b *Broker) BroadcastPresence(userID string, status string) {
	data := makeStatusPayload(userID, status)
	b.mu.RLock()
	defer b.mu.RUnlock()
	b.broadcastLocked(data)
}

func (b *Broker) reaper() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		b.sweepInactiveUsers()
	}
}

func (b *Broker) sweepInactiveUsers() {
	b.mu.Lock()
	defer b.mu.Unlock()

	activeUsers := make(map[string]bool)
	for _, uid := range b.clients {
		activeUsers[uid] = true
	}

	for userID, status := range b.userStatus {
		if status == "online" && !activeUsers[userID] {
			if last, ok := b.lastSeen[userID]; ok && time.Since(last) > 90*time.Second {
				b.userStatus[userID] = "offline"
				b.broadcastLocked(makeStatusPayload(userID, "offline"))
			}
		}
	}
}
