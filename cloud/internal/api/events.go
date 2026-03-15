package api

import (
	"fmt"
	"log"
	"net/http"
	"sync"
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
	}
	go broker.listen()
	return broker
}

func (b *Broker) listen() {
	for {
		select {
		// Add new client
		case req := <-b.newClients:
			b.mu.Lock()
			b.clients[req.msgChan] = req.userID
			b.mu.Unlock()
			log.Printf("Client connected: %s", req.userID)

		// Remove client
		case s := <-b.closedClients:
			b.mu.Lock()
			delete(b.clients, s)
			close(s)
			b.mu.Unlock()
			log.Printf("Client disconnected")

		// Broadcast message
		case event := <-b.messages:
			b.mu.RLock()
			for clientChan, userID := range b.clients {
				// Only send if userID matches target
				if userID == event.TargetUserID {
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
	// Read securely from context (set by AuthMiddleware if wrapped, otherwise query param fallback for direct access if necessary)
	// Actually, best to wrap it in main.go
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		// Fallback for direct SSE access if query param is provided (though AuthMiddleware is preferred)
		userID = r.URL.Query().Get("user_id")
	}

	if userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}


	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported!", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	// Create a channel for this client
	messageChan := make(chan string)

	// Register client
	b.newClients <- clientReq{msgChan: messageChan, userID: userID}

	// Listen for closing connection
	notify := r.Context().Done()

	go func() {
		<-notify
		b.closedClients <- messageChan
	}()

	for {
		msg, open := <-messageChan
		if !open {
			break
		}
		fmt.Fprintf(w, "data: %s\n\n", msg)
		flusher.Flush()
	}
}

func (b *Broker) Broadcast(targetUserID, data string) {
	b.messages <- messageEvent{TargetUserID: targetUserID, Data: data}
}
