package api

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/nicoh/tide/internal/store"
)

var quicknoteUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for shared quicknotes
	},
}

// QuicknoteHandler provides HTTP endpoints and WebSocket collaboration for Quicknotes.
type QuicknoteHandler struct {
	store *store.SQLiteStore
	hub   *Hub
}

// NewQuicknoteHandler initializes a new QuicknoteHandler.
func NewQuicknoteHandler(store *store.SQLiteStore, hub *Hub) *QuicknoteHandler {
	if hub == nil {
		hub = GlobalHub
	}
	return &QuicknoteHandler{
		store: store,
		hub:   hub,
	}
}

// RegisterRoutes registers HTTP and WebSocket routes for quicknotes.
func (h *QuicknoteHandler) RegisterRoutes(r chi.Router) {
	r.Get("/{slug}", h.GetQuicknote)
	r.Put("/{slug}", h.SaveQuicknote)
	r.Get("/{slug}/crdt-state", h.GetCRDTState)
	r.Post("/{slug}/compact", h.Compact)
	r.Get("/{slug}/ws", h.ServeWs)
	r.Get("/ws/{slug}", h.ServeWs)
}

// QuicknoteResponse represents the JSON output for quicknote metadata & content.
type QuicknoteResponse struct {
	Slug      string    `json:"slug"`
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// GetQuicknote retrieves or lazily creates a quicknote by slug.
func (h *QuicknoteHandler) GetQuicknote(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	qn, err := h.store.GetOrCreateQuicknote(r.Context(), slug, slug)
	if err != nil {
		http.Error(w, "Failed to get quicknote: "+err.Error(), http.StatusInternalServerError)
		return
	}

	resp := QuicknoteResponse{
		Slug:      qn.Slug,
		Title:     qn.Title,
		Content:   qn.Content,
		CreatedAt: qn.CreatedAt,
		UpdatedAt: qn.UpdatedAt,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// SaveQuicknote updates the title and content of a quicknote.
func (h *QuicknoteHandler) SaveQuicknote(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	var body struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.store.SaveQuicknote(r.Context(), slug, body.Title, body.Content); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to save quicknote: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// QuicknoteSnapshotResponse represents the snapshot in CRDT state.
type QuicknoteSnapshotResponse struct {
	IV         string `json:"iv"`
	Ciphertext string `json:"ciphertext"`
	SeqID      int64  `json:"seq_id"`
}

// QuicknoteWALResponse represents an entry in the quicknote CRDT WAL.
type QuicknoteWALResponse struct {
	SeqID      int64  `json:"seq_id"`
	KeyEpoch   uint32 `json:"key_epoch"`
	IV         string `json:"iv"`
	Ciphertext string `json:"ciphertext"`
	CreatedAt  int64  `json:"created_at"`
}

// QuicknoteCRDTStateResponse matches Tide's CRDT state structure.
type QuicknoteCRDTStateResponse struct {
	Snapshot *QuicknoteSnapshotResponse `json:"snapshot"`
	WAL      []QuicknoteWALResponse     `json:"wal"`
}

// GetCRDTState returns the current snapshot and WAL entries for a quicknote.
func (h *QuicknoteHandler) GetCRDTState(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	qn, entries, err := h.store.GetQuicknoteCRDTState(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to get CRDT state: "+err.Error(), http.StatusInternalServerError)
		return
	}

	var snapshot *QuicknoteSnapshotResponse
	if qn != nil && (len(qn.SnapshotIV) > 0 || len(qn.SnapshotCiphertext) > 0 || qn.SnapshotSeqID > 0) {
		snapshot = &QuicknoteSnapshotResponse{
			IV:         base64.StdEncoding.EncodeToString(qn.SnapshotIV),
			Ciphertext: base64.StdEncoding.EncodeToString(qn.SnapshotCiphertext),
			SeqID:      qn.SnapshotSeqID,
		}
	}

	wal := make([]QuicknoteWALResponse, 0, len(entries))
	for _, e := range entries {
		wal = append(wal, QuicknoteWALResponse{
			SeqID:      e.SeqID,
			KeyEpoch:   e.KeyEpoch,
			IV:         base64.StdEncoding.EncodeToString(e.IV),
			Ciphertext: base64.StdEncoding.EncodeToString(e.Ciphertext),
			CreatedAt:  e.CreatedAt,
		})
	}

	resp := QuicknoteCRDTStateResponse{
		Snapshot: snapshot,
		WAL:      wal,
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

// Compact compacts the quicknote snapshot and prunes WAL entries up to up_to_seq_id.
func (h *QuicknoteHandler) Compact(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	var req struct {
		IV               string `json:"iv"`
		IVBase64         string `json:"ivBase64"`
		Ciphertext       string `json:"ciphertext"`
		CiphertextBase64 string `json:"ciphertextBase64"`
		UpToSeqID        int64  `json:"up_to_seq_id"`
		UpToSeqIDCamel   int64  `json:"upToSeqId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	ivStr := req.IV
	if ivStr == "" {
		ivStr = req.IVBase64
	}
	cipherStr := req.Ciphertext
	if cipherStr == "" {
		cipherStr = req.CiphertextBase64
	}
	upToSeqID := req.UpToSeqID
	if upToSeqID == 0 {
		upToSeqID = req.UpToSeqIDCamel
	}

	iv, err := base64.StdEncoding.DecodeString(ivStr)
	if err != nil {
		http.Error(w, "Invalid iv base64 encoding", http.StatusBadRequest)
		return
	}

	ciphertext, err := base64.StdEncoding.DecodeString(cipherStr)
	if err != nil {
		http.Error(w, "Invalid ciphertext base64 encoding", http.StatusBadRequest)
		return
	}

	if err := h.store.CompactQuicknoteSnapshot(r.Context(), slug, iv, ciphertext, upToSeqID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to compact snapshot: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// ServeWs upgrades HTTP to WebSocket and handles collaborative editing for quicknotes.
func (h *QuicknoteHandler) ServeWs(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	// Ensure quicknote exists so foreign key references in quicknote_wal succeed
	if _, err := h.store.GetOrCreateQuicknote(r.Context(), slug, slug); err != nil {
		log.Printf("[Quicknote WS] Failed to get or create quicknote for slug %s: %v", slug, err)
		http.Error(w, "Failed to initialize quicknote: "+err.Error(), http.StatusInternalServerError)
		return
	}

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
				}
			}
		}
	}

	if userID == "" {
		userID = "guest-" + uuid.New().String()[:8]
	}

	conn, err := quicknoteUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[Quicknote WS] Upgrade error: %v", err)
		return
	}

	hub := h.hub
	if hub == nil {
		hub = GlobalHub
	}

	roomID := "quicknote:" + slug
	client := &Client{
		hub:        hub,
		fileID:     roomID,
		userID:     userID,
		yClientID:  yClientID,
		conn:       conn,
		send:       make(chan []byte, 256),
		done:       make(chan struct{}),
		permission: "edit",
	}

	hub.addClient(client)

	go client.writePump()
	go h.readPumpQuicknote(client, slug)
}

func (h *QuicknoteHandler) readPumpQuicknote(c *Client, slug string) {
	defer func() {
		c.close()
		c.hub.removeClient(c)
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
				log.Printf("[Quicknote WS] Read error from user %s in slug %s: %v", c.userID, slug, err)
			}
			break
		}

		if messageType != websocket.BinaryMessage || len(payload) < 1 {
			continue
		}

		msgType := payload[0]
		switch msgType {
		case FrameTypeCRDTUpdate: // 0x01
			if len(payload) < MinEncryptedFrameLen {
				log.Printf("[Quicknote WS] Discarding short CRDT frame (len=%d) from user %s in slug %s", len(payload), c.userID, slug)
				continue
			}

			keyEpoch := binary.BigEndian.Uint32(payload[1:5])
			iv := payload[5:17]
			ciphertext := payload[17:]

			seqID, walErr := h.store.AppendQuicknoteWAL(context.Background(), slug, keyEpoch, iv, ciphertext)
			if walErr != nil {
				log.Printf("[Quicknote WS] Failed to append Quicknote WAL for slug %s: %v", slug, walErr)
			}

			// Broadcast binary frame to room peers
			c.hub.broadcast(c, payload)

			// Compact request check every 50 WAL entries
			if seqID > 0 && seqID%50 == 0 {
				_ = c.sendControl(map[string]any{
					"action": "COMPACT_REQUEST",
				})
			}

		case FrameTypeAwareness: // 0x02
			if len(payload) < MinEncryptedFrameLen {
				continue
			}
			// Relay in-memory awareness/cursor frames to room peers
			c.hub.broadcast(c, payload)

		case FrameTypeControl: // 0x03
			log.Printf("[Quicknote WS] Received control frame from user %s in slug %s", c.userID, slug)

		default:
			log.Printf("[Quicknote WS] Unknown frame type 0x%02x from user %s in slug %s", msgType, c.userID, slug)
		}
	}
}
