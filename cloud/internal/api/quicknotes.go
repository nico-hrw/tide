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
	"mime"
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
	CheckOrigin: checkQuicknoteOrigin,
}

// checkQuicknoteOrigin validates the Origin header against trusted origins to prevent CSWSH.
func checkQuicknoteOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}

	if origin == "http://"+r.Host || origin == "https://"+r.Host {
		return true
	}

	switch origin {
	case "https://go-tide.app", "https://www.go-tide.app",
		"https://hrw.rocks", "https://www.hrw.rocks", "https://track.hrw.rocks":
		return true
	}

	if os.Getenv("ENV") != "production" {
		if origin == "http://localhost" || origin == "http://127.0.0.1" ||
			origin == "https://localhost" || origin == "https://127.0.0.1" ||
			strings.HasPrefix(origin, "http://localhost:") ||
			strings.HasPrefix(origin, "http://127.0.0.1:") ||
			strings.HasPrefix(origin, "https://localhost:") ||
			strings.HasPrefix(origin, "https://127.0.0.1:") {
			return true
		}
	}

	if appURL := strings.TrimSpace(os.Getenv("APP_URL")); appURL != "" {
		if origin == strings.TrimRight(appURL, "/") {
			return true
		}
	}

	if envOrigins := os.Getenv("ALLOWED_ORIGINS"); envOrigins != "" {
		for _, o := range strings.Split(envOrigins, ",") {
			o = strings.TrimSpace(o)
			if o != "" && origin == strings.TrimRight(o, "/") {
				return true
			}
		}
	}

	log.Printf("[Quicknote WS] Rejecting untrusted origin: %s", origin)
	return false
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
	r.Delete("/{slug}/files/{fileID}", h.DeleteQuicknoteFile)
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
		log.Printf("[Quicknote] Failed to get quicknote %s: %v", slug, err)
		http.Error(w, "Failed to get quicknote", http.StatusInternalServerError)
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
		log.Printf("[Quicknote] Invalid request body for %s: %v", slug, err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if body.ParentSlug != nil && strings.TrimSpace(*body.ParentSlug) == slug {
		http.Error(w, "parent_slug cannot equal slug", http.StatusBadRequest)
		return
	}

	if err := h.store.SaveQuicknote(r.Context(), slug, body.Title, body.Content, body.ParentSlug); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		log.Printf("[Quicknote] Failed to save quicknote %s: %v", slug, err)
		http.Error(w, "Failed to save quicknote", http.StatusInternalServerError)
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
		log.Printf("[Quicknote] Failed to get quicknote tree for %s: %v", slug, err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Failed to get quicknote tree"})
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
		log.Printf("[Quicknote] Failed to get CRDT state for %s: %v", slug, err)
		http.Error(w, "Failed to get CRDT state", http.StatusInternalServerError)
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
		log.Printf("[Quicknote] Invalid compact request body for %s: %v", slug, err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
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

	qn, _, err := h.store.GetQuicknoteCRDTState(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		log.Printf("[Quicknote] Failed to verify CRDT state for %s: %v", slug, err)
		http.Error(w, "Failed to verify quicknote state", http.StatusInternalServerError)
		return
	}
	if upToSeqID < qn.SnapshotSeqID {
		http.Error(w, "up_to_seq_id cannot be less than current snapshot_seq_id", http.StatusConflict)
		return
	}

	if err := h.store.CompactQuicknoteSnapshot(r.Context(), slug, iv, ciphertext, upToSeqID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		log.Printf("[Quicknote] Failed to compact snapshot for %s: %v", slug, err)
		http.Error(w, "Failed to compact snapshot", http.StatusInternalServerError)
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
		log.Printf("[Quicknote] Failed to get quicknote files for %s: %v", slug, err)
		http.Error(w, "Failed to get quicknote files", http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []store.QuicknoteFile{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(files)
}

type quicknoteCountingReader struct {
	r io.Reader
	n int64
}

func (c *quicknoteCountingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

func getMaxQuicknotesTotalStorage() int64 {
	const defaultMaxTotal = int64(2) << 30 // 2 GB
	if envVal := strings.TrimSpace(os.Getenv("MAX_QUICKNOTES_TOTAL_STORAGE_MB")); envVal != "" {
		if mb, err := strconv.ParseInt(envVal, 10, 64); err == nil && mb > 0 && mb <= (1<<42) {
			return mb << 20
		}
	}
	return defaultMaxTotal
}

// UploadQuicknoteFile handles file attachment uploads with per-note and global storage quota checks.
func (h *QuicknoteHandler) UploadQuicknoteFile(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	if h.blobStore == nil {
		http.Error(w, "Blob storage not configured", http.StatusInternalServerError)
		return
	}

	if _, err := h.store.GetOrCreateQuicknote(r.Context(), slug, slug); err != nil {
		log.Printf("[Quicknote] Failed to initialize quicknote %s: %v", slug, err)
		http.Error(w, "Failed to initialize quicknote", http.StatusInternalServerError)
		return
	}

	const maxPerNote = int64(250 << 20) // 250 MB
	maxTotal := getMaxQuicknotesTotalStorage()

	token := r.Header.Get("X-Access-Token")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			token = strings.TrimPrefix(authHeader, "Bearer ")
		}
	}
	hasExpandToken := token != "" && ValidateStorageExpandToken(r.Context(), h.store, token)

	currentNoteStorage, err := h.store.GetQuicknoteTotalStorage(r.Context(), slug)
	if err != nil {
		log.Printf("[Quicknote] Failed to check current storage usage for %s: %v", slug, err)
		http.Error(w, "Failed to check current storage usage", http.StatusInternalServerError)
		return
	}

	currentTotalStorage, err := h.store.GetTotalQuicknotesStorage(r.Context())
	if err != nil {
		log.Printf("[Quicknote] Failed to check global quicknotes storage usage: %v", err)
		http.Error(w, "Failed to check global storage usage", http.StatusInternalServerError)
		return
	}

	remaining := maxTotal - currentTotalStorage
	if !hasExpandToken {
		perNoteRemaining := maxPerNote - currentNoteStorage
		if perNoteRemaining < remaining {
			remaining = perNoteRemaining
		}
	}

	if remaining <= 0 {
		http.Error(w, "Storage quota exceeded", http.StatusRequestEntityTooLarge)
		return
	}

	const multipartOverhead = int64(1 << 20)
	maxBodyBytes := remaining + multipartOverhead
	if r.ContentLength > maxBodyBytes {
		http.Error(w, "File too large for remaining storage quota", http.StatusRequestEntityTooLarge)
		return
	}

	respCtrl := http.NewResponseController(w)
	_ = respCtrl.SetReadDeadline(time.Now().Add(30 * time.Minute))
	_ = respCtrl.SetWriteDeadline(time.Now().Add(30 * time.Minute))

	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := r.ParseMultipartForm(32 << 20); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			http.Error(w, "File too large for remaining storage quota", http.StatusRequestEntityTooLarge)
			return
		}
		log.Printf("[Quicknote] Invalid multipart form for %s: %v", slug, err)
		http.Error(w, "Invalid multipart form", http.StatusBadRequest)
		return
	}
	if r.MultipartForm != nil {
		defer func() { _ = r.MultipartForm.RemoveAll() }()
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		log.Printf("[Quicknote] Failed to read file from form for %s: %v", slug, err)
		http.Error(w, "Failed to read file from form", http.StatusBadRequest)
		return
	}
	defer file.Close()

	if header.Size > remaining {
		http.Error(w, "File too large for remaining storage quota", http.StatusRequestEntityTooLarge)
		return
	}

	fileID := uuid.New().String()
	blobPath := "quicknotes/" + fileID
	cr := &quicknoteCountingReader{r: io.LimitReader(file, remaining+1)}
	if err := h.blobStore.Put(r.Context(), blobPath, cr); err != nil {
		log.Printf("[Quicknote] Failed to store file %s for %s: %v", blobPath, slug, err)
		http.Error(w, "Failed to store file", http.StatusInternalServerError)
		return
	}
	if cr.n > remaining {
		_ = h.blobStore.Delete(r.Context(), blobPath)
		http.Error(w, "File too large for remaining storage quota", http.StatusRequestEntityTooLarge)
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
		Size:      cr.n,
		BlobPath:  blobPath,
		CreatedAt: time.Now(),
	}

	if err := h.store.CreateQuicknoteFile(r.Context(), qf); err != nil {
		_ = h.blobStore.Delete(r.Context(), blobPath)
		log.Printf("[Quicknote] Failed to save file metadata for %s: %v", slug, err)
		http.Error(w, "Failed to save file metadata", http.StatusInternalServerError)
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

	respCtrl := http.NewResponseController(w)
	_ = respCtrl.SetReadDeadline(time.Now().Add(30 * time.Minute))
	_ = respCtrl.SetWriteDeadline(time.Now().Add(30 * time.Minute))

	mediaType, params, err := mime.ParseMediaType(qf.MIMEType)
	contentType := "application/octet-stream"
	if err == nil && mediaType != "" {
		if formatted := mime.FormatMediaType(mediaType, params); formatted != "" {
			contentType = formatted
		} else {
			contentType = mediaType
		}
	} else {
		mediaType = ""
	}

	disposition := "attachment"
	switch mediaType {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		disposition = "inline"
	}

	safeName := strings.Map(func(r rune) rune {
		if r == '"' || r == '\\' || r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, filepath.Base(qf.Name))
	if safeName == "" || safeName == "." || safeName == ".." {
		safeName = "download"
	}

	w.Header().Set("Content-Type", contentType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`%s; filename="%s"`, disposition, safeName))
	w.Header().Set("Content-Length", strconv.FormatInt(qf.Size, 10))
	_, _ = io.Copy(w, rc)
}

// DeleteQuicknoteFile removes an attachment from database and blob storage.
func (h *QuicknoteHandler) DeleteQuicknoteFile(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	fileID := chi.URLParam(r, "fileID")

	qf, err := h.store.GetQuicknoteFile(r.Context(), slug, fileID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if err := h.store.DeleteQuicknoteFile(r.Context(), slug, fileID); err != nil {
		http.Error(w, "Failed to delete file", http.StatusInternalServerError)
		return
	}

	// Delete blob from store
	if h.blobStore != nil {
		_ = h.blobStore.Delete(r.Context(), qf.BlobPath)
	}

	w.WriteHeader(http.StatusNoContent)
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
		http.Error(w, "Failed to initialize quicknote", http.StatusInternalServerError)
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
