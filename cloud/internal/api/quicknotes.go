package api

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
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
	store     *store.SQLiteStore
	blobStore store.BlobStore
	hub       *Hub
}

// NewQuicknoteHandler initializes a new QuicknoteHandler.
func NewQuicknoteHandler(store *store.SQLiteStore, blobStore store.BlobStore, hub *Hub) *QuicknoteHandler {
	if hub == nil {
		hub = GlobalHub
	}
	return &QuicknoteHandler{
		store:     store,
		blobStore: blobStore,
		hub:       hub,
	}
}

// RegisterRoutes registers HTTP and WebSocket routes for quicknotes.
func (h *QuicknoteHandler) RegisterRoutes(r chi.Router) {
	r.Get("/{slug}", h.GetQuicknote)
	r.Put("/{slug}", h.SaveQuicknote)
	r.Get("/{slug}/tree", h.GetTree)
	r.Get("/{slug}/crdt-state", h.GetCRDTState)
	r.Post("/{slug}/compact", h.Compact)
	r.Get("/{slug}/files", h.GetQuicknoteFiles)
	r.Post("/{slug}/files", h.UploadQuicknoteFile)
	r.Get("/{slug}/files/{fileID}", h.DownloadQuicknoteFile)
	r.Get("/{slug}/ws", h.ServeWs)
	r.Get("/ws/{slug}", h.ServeWs)
}

// QuicknoteResponse represents the JSON output for quicknote metadata & content.
type QuicknoteResponse struct {
	Slug       string    `json:"slug"`
	ParentSlug *string   `json:"parent_slug,omitempty"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// SaveQuicknoteRequest represents the JSON input for saving quicknote title, content & parent.
type SaveQuicknoteRequest struct {
	Title      string  `json:"title"`
	Content    string  `json:"content"`
	ParentSlug *string `json:"parent_slug,omitempty"`
}

// QuicknoteTreeResponse represents the JSON output for a quicknote hierarchy tree.
type QuicknoteTreeResponse struct {
	Tree []store.QuicknoteTreeNode `json:"tree"`
}

// GetQuicknote retrieves or lazily creates a quicknote by slug.
func (h *QuicknoteHandler) GetQuicknote(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	var parentSlug *string
	if p := strings.TrimSpace(r.URL.Query().Get("parent_slug")); p != "" {
		parentSlug = &p
	}

	qn, err := h.store.GetOrCreateQuicknote(r.Context(), slug, slug, parentSlug)
	if err != nil {
		http.Error(w, "Failed to get quicknote: "+err.Error(), http.StatusInternalServerError)
		return
	}

	resp := QuicknoteResponse{
		Slug:       qn.Slug,
		ParentSlug: qn.ParentSlug,
		Title:      qn.Title,
		Content:    qn.Content,
		CreatedAt:  qn.CreatedAt,
		UpdatedAt:  qn.UpdatedAt,
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

	var body SaveQuicknoteRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}

	if err := h.store.SaveQuicknote(r.Context(), slug, body.Title, body.Content, body.ParentSlug); err != nil {
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

// GetTree returns the hierarchical tree of quicknotes containing the specified slug.
func (h *QuicknoteHandler) GetTree(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	nodes, err := h.store.GetQuicknoteTree(r.Context(), slug)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Failed to get quicknote tree: " + err.Error()})
		return
	}

	if nodes == nil {
		nodes = []store.QuicknoteTreeNode{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(QuicknoteTreeResponse{Tree: nodes})
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

// GetQuicknoteFiles lists all file attachments for a quicknote.
func (h *QuicknoteHandler) GetQuicknoteFiles(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	files, err := h.store.GetQuicknoteFiles(r.Context(), slug)
	if err != nil {
		http.Error(w, "Failed to get quicknote files: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []store.QuicknoteFile{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(files)
}

// UploadQuicknoteFile handles file attachment uploads with a 250MB per-note quota check.
func (h *QuicknoteHandler) UploadQuicknoteFile(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	if _, err := h.store.GetOrCreateQuicknote(r.Context(), slug, slug); err != nil {
		http.Error(w, "Failed to initialize quicknote: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if h.blobStore == nil {
		http.Error(w, "Blob storage not configured", http.StatusInternalServerError)
		return
	}

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		http.Error(w, "Invalid multipart form: "+err.Error(), http.StatusBadRequest)
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Failed to read file from form: "+err.Error(), http.StatusBadRequest)
		return
	}
	defer file.Close()

	const maxStorage = 250 * 1024 * 1024 // 250MB
	currentStorage, err := h.store.GetQuicknoteTotalStorage(r.Context(), slug)
	if err != nil {
		http.Error(w, "Failed to check current storage usage: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if currentStorage+header.Size > maxStorage {
		token := r.Header.Get("X-Access-Token")
		if token == "" {
			token = r.FormValue("token")
		}
		if token == "" {
			token = r.URL.Query().Get("token")
		}
		if token == "" {
			authHeader := r.Header.Get("Authorization")
			if strings.HasPrefix(authHeader, "Bearer ") {
				token = strings.TrimPrefix(authHeader, "Bearer ")
			}
		}

		if !ValidateStorageExpandToken(r.Context(), h.store, token) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusForbidden)
			_ = json.NewEncoder(w).Encode(map[string]interface{}{
				"error":   "storage_limit_exceeded",
				"limit":   maxStorage,
				"current": currentStorage,
				"message": "Speicherlimit von 250MB pro Notiz überschritten. Bitte melde dich an oder gib ein Zugriffs-Token ein.",
			})
			return
		}
	}

	fileID := uuid.New().String()
	if err := h.blobStore.Put(r.Context(), fileID, file); err != nil {
		http.Error(w, "Failed to store file: "+err.Error(), http.StatusInternalServerError)
		return
	}

	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	qf := &store.QuicknoteFile{
		ID:        fileID,
		Slug:      slug,
		Name:      filepath.Base(header.Filename),
		MIMEType:  mimeType,
		Size:      header.Size,
		BlobPath:  fileID,
		CreatedAt: time.Now(),
	}

	if err := h.store.CreateQuicknoteFile(r.Context(), qf); err != nil {
		_ = h.blobStore.Delete(r.Context(), fileID)
		http.Error(w, "Failed to save file metadata: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(qf)
}

// DownloadQuicknoteFile retrieves a quicknote attachment by ID and streams the blob content.
func (h *QuicknoteHandler) DownloadQuicknoteFile(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	fileID := strings.TrimSpace(chi.URLParam(r, "fileID"))
	if slug == "" || fileID == "" {
		http.Error(w, "slug and fileID are required", http.StatusBadRequest)
		return
	}

	qf, err := h.store.GetQuicknoteFile(r.Context(), slug, fileID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if h.blobStore == nil {
		http.Error(w, "Blob storage not configured", http.StatusInternalServerError)
		return
	}

	rc, err := h.blobStore.Get(r.Context(), qf.BlobPath)
	if err != nil {
		http.Error(w, "File content not found", http.StatusNotFound)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", qf.MIMEType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filepath.Base(qf.Name)))
	w.Header().Set("Content-Length", strconv.FormatInt(qf.Size, 10))
	_, _ = io.Copy(w, rc)
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
