package api

import (
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: checkOrigin,
}

// checkOrigin validates the Origin header against trusted origins to prevent CSWSH (SEC-08).
func checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		// Allow requests without Origin header (e.g. non-browser clients, native apps, backend tests)
		return true
	}

	// 1. Same host match (Origin matches Host header)
	if origin == "http://"+r.Host || origin == "https://"+r.Host {
		return true
	}

	// 2. Default local development origins & production domains
	trustedOrigins := []string{
		"http://localhost:3000",
		"http://localhost:5173",
		"http://localhost:8080",
		"http://127.0.0.1:3000",
		"http://127.0.0.1:5173",
		"http://127.0.0.1:8080",
		"https://go-tide.app",
		"https://www.go-tide.app",
	}
	for _, trusted := range trustedOrigins {
		if origin == trusted {
			return true
		}
	}

	// Also allow arbitrary localhost and 127.0.0.1 dev ports
	if strings.HasPrefix(origin, "http://localhost:") || strings.HasPrefix(origin, "http://127.0.0.1:") {
		return true
	}

	// 3. Configured APP_URL
	if appURL := strings.TrimSpace(os.Getenv("APP_URL")); appURL != "" {
		if origin == strings.TrimRight(appURL, "/") {
			return true
		}
	}

	// 4. Configured ALLOWED_ORIGINS (comma-separated list)
	if envOrigins := os.Getenv("ALLOWED_ORIGINS"); envOrigins != "" {
		for _, o := range strings.Split(envOrigins, ",") {
			o = strings.TrimSpace(o)
			if o != "" && origin == strings.TrimRight(o, "/") {
				return true
			}
		}
	}

	log.Printf("[WebSocket] Rejecting untrusted origin: %s", origin)
	return false
}

// Hub maintains the set of active clients per fileID and broadcasts messages to the clients.
type Hub struct {
	// Registered clients by fileID
	rooms   map[string]map[*Client]bool
	history map[string][][]byte
	mu      sync.RWMutex
}

var GlobalHub = &Hub{
	rooms:   make(map[string]map[*Client]bool),
	history: make(map[string][][]byte),
}

// Client is a middleman between the websocket connection and the hub.
type Client struct {
	hub    *Hub
	fileID string
	userID string
	conn   *websocket.Conn
	wmu    sync.Mutex
}

func (c *Client) writeMessage(messageType int, data []byte) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	return c.conn.WriteMessage(messageType, data)
}

func (h *Hub) addClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[c.fileID] == nil {
		h.rooms[c.fileID] = make(map[*Client]bool)
		h.history[c.fileID] = make([][]byte, 0)
	}
	h.rooms[c.fileID][c] = true
	log.Printf("[WebSocket] Client joined room %s (Total in room: %d)", c.fileID, len(h.rooms[c.fileID]))

	if len(h.history[c.fileID]) > 0 {
		for _, msg := range h.history[c.fileID] {
			_ = c.writeMessage(websocket.BinaryMessage, msg)
		}
	}
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.rooms[c.fileID]; ok {
		delete(h.rooms[c.fileID], c)
		if len(h.rooms[c.fileID]) == 0 {
			delete(h.rooms, c.fileID)
			delete(h.history, c.fileID)
			log.Printf("[WebSocket] Room %s closed (empty)", c.fileID)
		} else {
			log.Printf("[WebSocket] Client left room %s (Remaining: %d)", c.fileID, len(h.rooms[c.fileID]))
		}
	}
}

func (h *Hub) broadcast(sender *Client, message []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()

	if h.history[sender.fileID] != nil {
		if len(h.history[sender.fileID]) >= 100 {
			h.history[sender.fileID] = h.history[sender.fileID][1:]
		}
		msgCopy := make([]byte, len(message))
		copy(msgCopy, message)
		h.history[sender.fileID] = append(h.history[sender.fileID], msgCopy)
	}

	room := h.rooms[sender.fileID]
	for client := range room {
		if client != sender {
			// Broadcast to everyone else in the room
			err := client.writeMessage(websocket.BinaryMessage, message)
			if err != nil {
				log.Printf("[WebSocket] Error writing to client %s: %v", client.userID, err)
				client.conn.Close()
			}
		}
	}
}

func (h *FileHandler) ServeWs(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	if fileID == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	var userID string
	if ctxUserID, ok := r.Context().Value("user_id").(string); ok && ctxUserID != "" {
		userID = ctxUserID
	}

	if userID == "" {
		tokenString := ""
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenString = strings.TrimPrefix(authHeader, "Bearer ")
		}
		if tokenString == "" {
			tokenString = r.URL.Query().Get("token")
		}
		if tokenString == "" {
			if cookie, err := r.Cookie("tide_session"); err == nil {
				tokenString = cookie.Value
			}
		}

		if tokenString != "" {
			jwtKeyStr := os.Getenv("JWT_SECRET")
			if jwtKeyStr != "" {
				token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
					if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
						return nil, http.ErrAbortHandler
					}
					return []byte(jwtKeyStr), nil
				})
				if err == nil && token.Valid {
					if claims, ok := token.Claims.(jwt.MapClaims); ok {
						if sub, ok := claims["sub"].(string); ok && sub != "" {
							userID = sub
						} else if uid, ok := claims["user_id"].(string); ok && uid != "" {
							userID = uid
						}
					}
				} else if err != nil {
					log.Printf("[WebSocket] Token validation error: %v", err)
				}
			}
		}
	}

	if userID == "" {
		http.Error(w, "Unauthorized: Authentication required for collaboration", http.StatusUnauthorized)
		return
	}

	// [COLLAB-AUTH] Verify that user has access to this file
	if _, err := h.Store.GetAccessibleFile(r.Context(), fileID, userID); err != nil {
		http.Error(w, "Forbidden: No access to file", http.StatusForbidden)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[WebSocket] Upgrade error:", err)
		return
	}

	client := &Client{
		hub:    GlobalHub,
		fileID: fileID,
		userID: userID,
		conn:   conn,
	}

	client.hub.addClient(client)

	// Listen for messages
	go func() {
		defer func() {
			client.hub.removeClient(client)
			client.conn.Close()
		}()
		for {
			_, message, err := client.conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("[WebSocket] Read error: %v", err)
				}
				break
			}
			// Yjs updates are binary, broadcast them directly to all other room members
			client.hub.broadcast(client, message)
		}
	}()
}
