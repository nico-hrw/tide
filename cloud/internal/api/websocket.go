package api

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

// Binary E2EE WebSocket Framing Protocol (Contract 1.1)
const (
	FrameTypeCRDTUpdate byte = 0x01
	FrameTypeAwareness  byte = 0x02
	FrameTypeControl    byte = 0x03
	MinEncryptedFrameLen     = 1 + 4 + 12 + 16 // 33 Bytes: MsgType(1) + KeyEpoch(4) + IV(12) + GCMTag(16)
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
		"http://localhost:3000", "http://localhost:5173", "http://localhost:8080",
		"http://127.0.0.1:3000", "http://127.0.0.1:5173", "http://127.0.0.1:8080",
		"https://go-tide.app", "https://www.go-tide.app",
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

// Permission helpers matching store Contract 1.1
func canRead(perm string) bool {
	return perm == "owner" || perm == "share" || perm == "edit" || perm == "view"
}

func canWrite(perm string) bool {
	return perm == "owner" || perm == "share" || perm == "edit"
}

// Hub maintains the set of active clients per fileID and coordinates broadcasts and live evictions.
// BUG-07: room.history ring buffer has been completely removed to avoid update losses and memory exhaustion.
type Hub struct {
	// Registered clients by fileID
	rooms     map[string]map[*Client]bool
	lastPulse map[string]time.Time
	mu        sync.RWMutex
}

var GlobalHub = &Hub{
	rooms:     make(map[string]map[*Client]bool),
	lastPulse: make(map[string]time.Time),
}

// Client is a middleman between the websocket connection and the hub.
type Client struct {
	hub        *Hub
	fileID     string
	userID     string
	yClientID  uint32
	conn       *websocket.Conn
	send       chan []byte
	done       chan struct{}
	closeOnce  sync.Once
	permission string
	pmu        sync.RWMutex
	wmu        sync.Mutex
}

func (c *Client) close() {
	c.closeOnce.Do(func() {
		close(c.done)
		c.conn.Close()
	})
}

func (c *Client) getPermission() string {
	c.pmu.RLock()
	defer c.pmu.RUnlock()
	return c.permission
}

func (c *Client) setPermission(perm string) {
	c.pmu.Lock()
	defer c.pmu.Unlock()
	c.permission = perm
}

func (c *Client) writeMessage(messageType int, data []byte) error {
	c.wmu.Lock()
	defer c.wmu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	return c.conn.WriteMessage(messageType, data)
}

func makeControlFrame(payload any) ([]byte, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	frame := make([]byte, 1+len(data))
	frame[0] = FrameTypeControl
	copy(frame[1:], data)
	return frame, nil
}

func (c *Client) sendControl(payload any) error {
	frame, err := makeControlFrame(payload)
	if err != nil {
		return err
	}
	select {
	case <-c.done:
		return nil
	case c.send <- frame:
		return nil
	default:
		log.Printf("[WebSocket] Dropping control frame for slow client %s in file %s", c.userID, c.fileID)
		return nil
	}
}

func (h *Hub) addClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[c.fileID] == nil {
		h.rooms[c.fileID] = make(map[*Client]bool)
	}
	h.rooms[c.fileID][c] = true
	log.Printf("[WebSocket] Client %s (yClientId: %d) joined room %s (Total in room: %d)", c.userID, c.yClientID, c.fileID, len(h.rooms[c.fileID]))
}

func (h *Hub) removeClient(c *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[c.fileID]; ok {
		delete(room, c)
		if len(room) == 0 {
			delete(h.rooms, c.fileID)
			delete(h.lastPulse, c.fileID)
			log.Printf("[WebSocket] Room %s closed (empty)", c.fileID)
		} else {
			log.Printf("[WebSocket] Client %s left room %s (Remaining: %d)", c.userID, c.fileID, len(room))
		}
	}
}

// broadcast sends binary data to all clients in the room except sender.
func (h *Hub) broadcast(sender *Client, message []byte) {
	h.mu.RLock()
	room := h.rooms[sender.fileID]
	clients := make([]*Client, 0, len(room))
	for client := range room {
		if client != sender {
			clients = append(clients, client)
		}
	}
	h.mu.RUnlock()

	for _, client := range clients {
		select {
		case <-client.done:
		case client.send <- message:
		default:
			log.Printf("[WebSocket] Dropping slow client frame for user %s in file %s", client.userID, client.fileID)
		}
	}
}

// broadcastControl broadcasts a FrameTypeControl (0x03) frame to all clients currently in fileID room.
func (h *Hub) broadcastControl(fileID string, payload any) {
	frame, err := makeControlFrame(payload)
	if err != nil {
		log.Printf("[WebSocket] Error creating control frame: %v", err)
		return
	}

	h.mu.RLock()
	room := h.rooms[fileID]
	clients := make([]*Client, 0, len(room))
	for client := range room {
		clients = append(clients, client)
	}
	h.mu.RUnlock()

	for _, client := range clients {
		select {
		case <-client.done:
		case client.send <- frame:
		default:
			log.Printf("[WebSocket] Dropping control frame for slow client %s in file %s", client.userID, client.fileID)
		}
	}
}

// triggerSSEPulse broadcasts NOTE_ACTIVITY_PULSE and NOTE_WAL_APPENDED via SSE, throttled to max 1x per 5 seconds per room.
func (h *Hub) triggerSSEPulse(broker *Broker, fileID string) {
	if broker == nil {
		return
	}
	h.mu.Lock()
	if h.lastPulse == nil {
		h.lastPulse = make(map[string]time.Time)
	}
	last, ok := h.lastPulse[fileID]
	now := time.Now()
	if ok && now.Sub(last) < 5*time.Second {
		h.mu.Unlock()
		return
	}
	h.lastPulse[fileID] = now
	h.mu.Unlock()

	pulsePayload, _ := json.Marshal(map[string]any{
		"type": "NOTE_ACTIVITY_PULSE",
		"payload": map[string]any{
			"file_id": fileID,
		},
	})
	walPayload, _ := json.Marshal(map[string]any{
		"type": "NOTE_WAL_APPENDED",
		"payload": map[string]any{
			"file_id": fileID,
		},
	})
	broker.BroadcastAll(string(pulsePayload))
	broker.BroadcastAll(string(walPayload))
}

// EnforcePermissionChange applies live role updates or instant evictions for a targeted user.
func (h *Hub) EnforcePermissionChange(fileID, targetUserID, newPermission string) {
	h.mu.RLock()
	room := h.rooms[fileID]
	var targets []*Client
	for client := range room {
		if client.userID == targetUserID {
			targets = append(targets, client)
		}
	}
	h.mu.RUnlock()

	for _, client := range targets {
		if newPermission == "revoked" || newPermission == "" {
			_ = client.sendControl(map[string]any{"action": "REVOKED"})
			client.close()
			h.removeClient(client)
			h.broadcastControl(fileID, map[string]any{
				"action":    "PEER_LEFT",
				"yClientId": client.yClientID,
			})
		} else {
			client.setPermission(newPermission)
			_ = client.sendControl(map[string]any{
				"action":     "ROLE_CHANGED",
				"permission": newPermission,
			})
		}
	}
}

// BroadcastKeyRotation sends KEY_ROTATED control frame to all room participants.
func (h *Hub) BroadcastKeyRotation(fileID string, newKeyEpoch uint32) {
	h.broadcastControl(fileID, map[string]any{
		"action":   "KEY_ROTATED",
		"keyEpoch": newKeyEpoch,
	})
}

// writePump handles outgoing messages and regular pings from the send queue.
func (c *Client) writePump() {
	ticker := time.NewTicker(15 * time.Second)
	defer func() {
		ticker.Stop()
		c.close()
	}()
	for {
		select {
		case <-c.done:
			return
		case message, ok := <-c.send:
			if !ok {
				_ = c.writeMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.writeMessage(websocket.BinaryMessage, message); err != nil {
				log.Printf("[WebSocket] Error writing to client %s: %v", c.userID, err)
				return
			}
		case <-ticker.C:
			if err := c.writeMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// readPump processes incoming WebSocket frames according to E2EE Contract 1.1.
func (c *Client) readPump(h *FileHandler) {
	defer func() {
		c.close()
		c.hub.removeClient(c)
		// Disconnect cleanup: immediately broadcast PEER_LEFT control frame (0ms ghost cursor removal)
		c.hub.broadcastControl(c.fileID, map[string]any{
			"action":    "PEER_LEFT",
			"yClientId": c.yClientID,
		})
	}()

	c.conn.SetReadLimit(10 * 1024 * 1024) // 10MB frame limit
	_ = c.conn.SetReadDeadline(time.Now().Add(30 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		return nil
	})

	for {
		messageType, payload, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Read error from user %s: %v", c.userID, err)
			}
			break
		}

		if messageType != websocket.BinaryMessage || len(payload) < 1 {
			continue
		}

		msgType := payload[0]
		switch msgType {
		case FrameTypeCRDTUpdate: // 0x01
			// 1. MinEncryptedFrameLen validation
			if len(payload) < MinEncryptedFrameLen {
				log.Printf("[WebSocket] Discarding short CRDT frame (len=%d) from user %s", len(payload), c.userID)
				continue
			}

			// 2. BUG-01: Security gate - viewers cannot inject CRDT updates
			if !canWrite(c.getPermission()) {
				log.Printf("[WebSocket] Security violation: user %s with permission %q attempted CRDT update on file %s (discarded)", c.userID, c.getPermission(), c.fileID)
				continue
			}

			// 3. Extract header fields
			keyEpoch := binary.BigEndian.Uint32(payload[1:5])
			iv := payload[5:17]
			ciphertext := payload[17:]

			// 4. BUG-08: Immediate SQLite WAL persistence
			var seqID int64
			if walAppender, ok := any(h.Store).(interface {
				AppendYjsWAL(ctx context.Context, fileID string, keyEpoch uint32, iv, ciphertext []byte) (int64, error)
			}); ok {
				var walErr error
				seqID, walErr = walAppender.AppendYjsWAL(context.Background(), c.fileID, keyEpoch, iv, ciphertext)
				if walErr != nil {
					log.Printf("[WebSocket] Failed to append Yjs WAL for file %s: %v", c.fileID, walErr)
				}
			}

			// 5. Broadcast binary frame to all other room peers (BUG-07: room.history removed!)
			c.hub.broadcast(c, payload)

			// 6. Compact request check every 50 WAL entries
			if seqID > 0 && seqID%50 == 0 {
				_ = c.sendControl(map[string]any{
					"action": "COMPACT_REQUEST",
				})
			}

			// 7. Dispatch SSE pulse
			c.hub.triggerSSEPulse(h.Broker, c.fileID)

		case FrameTypeAwareness: // 0x02
			if len(payload) < MinEncryptedFrameLen {
				continue
			}
			// Allowed for all clients (including view). Relay in-memory only. Never persist to DB.
			c.hub.broadcast(c, payload)

		case FrameTypeControl: // 0x03
			log.Printf("[WebSocket] Received control frame from user %s in file %s", c.userID, c.fileID)

		default:
			log.Printf("[WebSocket] Unknown frame type 0x%02x from user %s", msgType, c.userID)
		}
	}
}

// ServeWs upgrades HTTP connections to WebSockets and handles collaborative editing sessions.
func (h *FileHandler) ServeWs(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	if fileID == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	// Parse yClientId from query parameter
	var yClientID uint32
	if yClientStr := r.URL.Query().Get("yClientId"); yClientStr != "" {
		if val, err := strconv.ParseUint(yClientStr, 10, 32); err == nil {
			yClientID = uint32(val)
		}
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
						if sub, okSub := claims["sub"].(string); okSub && sub != "" {
							userID = sub
						} else if uid, okUID := claims["user_id"].(string); okUID && uid != "" {
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
	file, err := h.Store.GetAccessibleFile(r.Context(), fileID, userID)
	if err != nil || file == nil || !canRead(file.Permission) {
		http.Error(w, "Forbidden: No access to file", http.StatusForbidden)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("[WebSocket] Upgrade error:", err)
		return
	}

	client := &Client{
		hub:        GlobalHub,
		fileID:     fileID,
		userID:     userID,
		yClientID:  yClientID,
		conn:       conn,
		send:       make(chan []byte, 256),
		done:       make(chan struct{}),
		permission: file.Permission,
	}

	client.hub.addClient(client)

	go client.writePump()
	go client.readPump(h)
}
