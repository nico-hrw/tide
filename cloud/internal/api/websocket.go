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
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for web app clients
	},
}

// Hub maintains the set of active clients per fileID and broadcasts messages to the clients.
type Hub struct {
	// Registered clients by fileID
	rooms map[string]map[*Client]bool
	mu    sync.RWMutex
}

var GlobalHub = &Hub{
	rooms: make(map[string]map[*Client]bool),
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
	}
	h.rooms[c.fileID][c] = true
	log.Printf("[WebSocket] Client joined room %s (Total in room: %d)", c.fileID, len(h.rooms[c.fileID]))
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if _, ok := h.rooms[c.fileID]; ok {
		delete(h.rooms[c.fileID], c)
		if len(h.rooms[c.fileID]) == 0 {
			delete(h.rooms, c.fileID)
			log.Printf("[WebSocket] Room %s closed (empty)", c.fileID)
		} else {
			log.Printf("[WebSocket] Client left room %s (Remaining: %d)", c.fileID, len(h.rooms[c.fileID]))
		}
	}
}

func (h *Hub) broadcast(sender *Client, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

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
						}
					}
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
