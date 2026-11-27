package api

import (
	"context"
	"database/sql"
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

	r.Group(func(r chi.Router) {
		r.Use(AuthMiddleware)
		r.Put("/{slug}/access", h.SetQuicknoteAccess)
		r.Post("/{slug}/access-requests", h.RequestQuicknoteAccess)
		r.Get("/{slug}/access-requests", h.ListQuicknoteAccessRequests)
		r.Post("/{slug}/access-requests/{userID}/approve", h.ApproveQuicknoteAccessRequest)
		r.Post("/{slug}/access-requests/{userID}/deny", h.DenyQuicknoteAccessRequest)
	})
}

// QuicknoteResponse represents the JSON output for quicknote metadata & content.
type QuicknoteResponse struct {
	Slug         string    `json:"slug"`
	ParentSlug   *string   `json:"parent_slug,omitempty"`
	Title        string    `json:"title"`
	Content      string    `json:"content"`
	OwnerID      *string   `json:"owner_id,omitempty"`
	AccessMode   string    `json:"access_mode"`
	IsOwner      bool      `json:"is_owner"`
	AccessStatus string    `json:"access_status"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
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

// extractOptionalUserID resolves an optional authenticated user ID from a WS ticket,
// request context, Bearer token, query token, or session cookie.
// Returns ("", false) when an explicit ?ticket= parameter is invalid or expired.
func extractOptionalUserID(r *http.Request) (string, bool) {
	if ticket := strings.TrimSpace(r.URL.Query().Get("ticket")); ticket != "" {
		uid, ok := ConsumeWSTicket(ticket)
		if !ok || uid == "" {
			return "", false
		}
		return uid, true
	}

	if ctxUserID, ok := r.Context().Value("user_id").(string); ok && ctxUserID != "" {
		return ctxUserID, true
	}

	tokenString := ""
	authHeader := r.Header.Get("Authorization")
	if strings.HasPrefix(authHeader, "Bearer ") {
		tokenString = strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))
	}
	if tokenString == "" {
		tokenString = strings.TrimSpace(r.URL.Query().Get("token"))
	}
	if tokenString == "" {
		if cookie, err := r.Cookie("tide_session"); err == nil {
			tokenString = strings.TrimSpace(cookie.Value)
		}
	}

	if tokenString != "" {
		jwtKeyStr := os.Getenv("JWT_SECRET")
		if jwtKeyStr != "" {
			token, err := jwt.Parse(
				tokenString,
				func(t *jwt.Token) (interface{}, error) {
					if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
						return nil, http.ErrAbortHandler
					}
					return []byte(jwtKeyStr), nil
				},
				jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
				jwt.WithExpirationRequired(),
			)
			if err == nil && token.Valid {
				if claims, ok := token.Claims.(jwt.MapClaims); ok {
					if sub, okSub := claims["sub"].(string); okSub && sub != "" {
						return sub, true
					}
					if uid, okUID := claims["user_id"].(string); okUID && uid != "" {
						return uid, true
					}
				}
			}
		}
	}

	return "", true
}

func writeQuicknoteAccessDenied(w http.ResponseWriter, qn *store.Quicknote, accessStatus string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error":         "access_approval_required",
		"access_mode":   "approval_required",
		"access_status": accessStatus,
		"slug":          qn.Slug,
	})
}

func buildQuicknoteResponse(qn *store.Quicknote, callerID, accessStatus string) QuicknoteResponse {
	accessMode := qn.AccessMode
	if accessMode == "" {
		accessMode = "open"
	}
	isOwner := callerID != "" && qn.OwnerID != nil && *qn.OwnerID == callerID
	return QuicknoteResponse{
		Slug:         qn.Slug,
		ParentSlug:   qn.ParentSlug,
		Title:        qn.Title,
		Content:      qn.Content,
		OwnerID:      qn.OwnerID,
		AccessMode:   accessMode,
		IsOwner:      isOwner,
		AccessStatus: accessStatus,
		CreatedAt:    qn.CreatedAt,
		UpdatedAt:    qn.UpdatedAt,
	}
}

func (h *QuicknoteHandler) authorizeQuicknote(w http.ResponseWriter, r *http.Request, slug string, createIfMissing bool) (*store.Quicknote, string, string, bool) {
	callerID, ticketOK := extractOptionalUserID(r)
	if !ticketOK {
		http.Error(w, "Unauthorized: invalid or expired ticket", http.StatusUnauthorized)
		return nil, "", "", false
	}

	var qn *store.Quicknote
	var err error
	if createIfMissing {
		qn, err = h.store.GetQuicknoteBySlug(r.Context(), slug)
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
			var parentSlug *string
			if p := strings.TrimSpace(r.URL.Query().Get("parent_slug")); p != "" {
				parentSlug = &p
			}
			qn, err = h.store.GetOrCreateQuicknote(r.Context(), slug, slug, parentSlug)
			if err == nil && callerID != "" {
				if setErr := h.store.SetQuicknoteOwnerIfUnset(r.Context(), slug, callerID); setErr == nil && qn.OwnerID == nil {
					ownerCopy := callerID
					qn.OwnerID = &ownerCopy
				}
			}
		}
	} else {
		qn, err = h.store.GetQuicknoteBySlug(r.Context(), slug)
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return nil, "", "", false
		}
	}
	if err != nil {
		log.Printf("[Quicknote] Failed to load quicknote %s: %v", slug, err)
		http.Error(w, "Failed to load quicknote", http.StatusInternalServerError)
		return nil, "", "", false
	}

	if qn.AccessMode == "" || qn.AccessMode == "open" {
		accessStatus := "open"
		if callerID != "" && qn.OwnerID != nil && *qn.OwnerID == callerID {
			accessStatus = "owner"
		}
		return qn, callerID, accessStatus, true
	}

	if qn.AccessMode == "approval_required" {
		if callerID == "" {
			writeQuicknoteAccessDenied(w, qn, "auth_required")
			return nil, "", "", false
		}
		if qn.OwnerID != nil && *qn.OwnerID == callerID {
			return qn, callerID, "owner", true
		}
		req, reqErr := h.store.GetQuicknoteAccessRequest(r.Context(), slug, callerID)
		if reqErr == nil && req != nil && req.Status == "approved" {
			return qn, callerID, "approved", true
		}
		status := "none"
		if reqErr == nil && req != nil && req.Status != "" {
			status = req.Status
		} else if reqErr != nil && !errors.Is(reqErr, store.ErrNotFound) && !errors.Is(reqErr, sql.ErrNoRows) {
			log.Printf("[Quicknote] Failed to check access request for %s user %s: %v", slug, callerID, reqErr)
			http.Error(w, "Failed to verify quicknote access", http.StatusInternalServerError)
			return nil, "", "", false
		}
		writeQuicknoteAccessDenied(w, qn, status)
		return nil, "", "", false
	}

	writeQuicknoteAccessDenied(w, qn, "none")
	return nil, "", "", false
}

// GetQuicknote retrieves or lazily creates a quicknote by slug.
func (h *QuicknoteHandler) GetQuicknote(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	qn, callerID, accessStatus, ok := h.authorizeQuicknote(w, r, slug, true)
	if !ok {
		return
	}

	resp := buildQuicknoteResponse(qn, callerID, accessStatus)

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

	qn, callerID, accessStatus, ok := h.authorizeQuicknote(w, r, slug, true)
	if !ok {
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

	if updated, err := h.store.GetQuicknoteBySlug(r.Context(), slug); err == nil && updated != nil {
		qn = updated
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(buildQuicknoteResponse(qn, callerID, accessStatus))
}

// GetTree returns the hierarchical tree of quicknotes containing the specified slug.
func (h *QuicknoteHandler) GetTree(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	if _, err := h.store.GetQuicknoteBySlug(r.Context(), slug); errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(QuicknoteTreeResponse{Tree: []store.QuicknoteTreeNode{}})
		return
	}

	if _, _, _, ok := h.authorizeQuicknote(w, r, slug, false); !ok {
		return
	}

	nodes, err := h.store.GetQuicknoteTree(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(QuicknoteTreeResponse{Tree: []store.QuicknoteTreeNode{}})
			return
		}
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

	if _, _, _, ok := h.authorizeQuicknote(w, r, slug, true); !ok {
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

	if _, _, _, ok := h.authorizeQuicknote(w, r, slug, false); !ok {
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

	if _, err := h.store.GetQuicknoteBySlug(r.Context(), slug); errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode([]store.QuicknoteFile{})
		return
	}

	if _, _, _, ok := h.authorizeQuicknote(w, r, slug, false); !ok {
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

	if _, _, _, ok := h.authorizeQuicknote(w, r, slug, true); !ok {
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

func safeQuicknoteDownloadHeaders(declaredMIME string, sniffBuf []byte) (string, string) {
	declaredBase, _, err := mime.ParseMediaType(declaredMIME)
	if err != nil {
		declaredBase = ""
	}
	declaredBase = strings.ToLower(strings.TrimSpace(declaredBase))

	sniffedRaw := http.DetectContentType(sniffBuf)
	sniffedBase, _, sniffErr := mime.ParseMediaType(sniffedRaw)
	if sniffErr != nil {
		sniffedBase = ""
	}
	sniffedBase = strings.ToLower(strings.TrimSpace(sniffedBase))

	switch declaredBase {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		if sniffedBase == declaredBase {
			return declaredBase, "inline"
		}
	}
	return "application/octet-stream", "attachment"
}

// DownloadQuicknoteFile retrieves a quicknote attachment by ID and streams the blob content.
func (h *QuicknoteHandler) DownloadQuicknoteFile(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	fileID := strings.TrimSpace(chi.URLParam(r, "fileID"))
	if slug == "" || fileID == "" {
		http.Error(w, "slug and fileID are required", http.StatusBadRequest)
		return
	}

	if _, _, _, ok := h.authorizeQuicknote(w, r, slug, false); !ok {
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

	var sniff [512]byte
	n, readErr := io.ReadFull(rc, sniff[:])
	if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		http.Error(w, "Failed to read file content", http.StatusInternalServerError)
		return
	}
	contentType, disposition := safeQuicknoteDownloadHeaders(qf.MIMEType, sniff[:n])

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
	if n > 0 {
		if _, err := w.Write(sniff[:n]); err != nil {
			return
		}
	}
	_, _ = io.Copy(w, rc)
}

// DeleteQuicknoteFile removes an attachment from database and blob storage.
func (h *QuicknoteHandler) DeleteQuicknoteFile(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	fileID := strings.TrimSpace(chi.URLParam(r, "fileID"))
	if slug == "" || fileID == "" {
		http.Error(w, "slug and fileID are required", http.StatusBadRequest)
		return
	}

	if _, _, _, ok := h.authorizeQuicknote(w, r, slug, false); !ok {
		return
	}

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

// SetQuicknoteAccess toggles the quicknote access mode ('open' | 'approval_required') for the owner.
func (h *QuicknoteHandler) SetQuicknoteAccess(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	var req struct {
		AccessMode string `json:"access_mode"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}
	req.AccessMode = strings.TrimSpace(req.AccessMode)
	if req.AccessMode != "open" && req.AccessMode != "approval_required" {
		http.Error(w, "access_mode must be 'open' or 'approval_required'", http.StatusBadRequest)
		return
	}

	if _, err := h.store.GetOrCreateQuicknote(r.Context(), slug, slug); err != nil {
		log.Printf("[Quicknote] Failed to ensure quicknote %s: %v", slug, err)
		http.Error(w, "Failed to initialize quicknote", http.StatusInternalServerError)
		return
	}

	qn, err := h.store.SetQuicknoteAccessMode(r.Context(), slug, userID, req.AccessMode)
	if err != nil {
		if errors.Is(err, store.ErrForbidden) {
			http.Error(w, "Forbidden: only the quicknote owner can change access mode", http.StatusForbidden)
			return
		}
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		log.Printf("[Quicknote] Failed to set access mode for %s: %v", slug, err)
		http.Error(w, "Failed to update quicknote access mode", http.StatusInternalServerError)
		return
	}

	if req.AccessMode == "approval_required" && h.hub != nil {
		allowed := map[string]bool{userID: true}
		if reqs, err := h.store.ListQuicknoteAccessRequests(r.Context(), slug); err == nil {
			for _, ar := range reqs {
				if ar.Status == "approved" {
					allowed[ar.UserID] = true
				}
			}
		}
		h.hub.EvictRoomClientsExcept("quicknote:"+slug, allowed)
	}

	accessStatus := "open"
	if qn.OwnerID != nil && *qn.OwnerID == userID {
		accessStatus = "owner"
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(buildQuicknoteResponse(qn, userID, accessStatus))
}

// RequestQuicknoteAccess submits or refreshes an access request for an approval-gated quicknote.
func (h *QuicknoteHandler) RequestQuicknoteAccess(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	qn, err := h.store.GetQuicknoteBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		log.Printf("[Quicknote] Failed to load quicknote %s: %v", slug, err)
		http.Error(w, "Failed to load quicknote", http.StatusInternalServerError)
		return
	}

	if qn.OwnerID != nil && *qn.OwnerID == userID {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"status": "owner"})
		return
	}

	req, err := h.store.UpsertQuicknoteAccessRequest(r.Context(), slug, userID)
	if err != nil {
		log.Printf("[Quicknote] Failed to upsert access request for %s user %s: %v", slug, userID, err)
		http.Error(w, "Failed to submit access request", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(req)
}

// ListQuicknoteAccessRequests lists all access requests for a quicknote (owner only).
func (h *QuicknoteHandler) ListQuicknoteAccessRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	qn, err := h.store.GetQuicknoteBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		log.Printf("[Quicknote] Failed to load quicknote %s: %v", slug, err)
		http.Error(w, "Failed to load quicknote", http.StatusInternalServerError)
		return
	}

	if qn.OwnerID == nil || *qn.OwnerID != userID {
		http.Error(w, "Forbidden: only the quicknote owner can view access requests", http.StatusForbidden)
		return
	}

	reqs, err := h.store.ListQuicknoteAccessRequests(r.Context(), slug)
	if err != nil {
		log.Printf("[Quicknote] Failed to list access requests for %s: %v", slug, err)
		http.Error(w, "Failed to list access requests", http.StatusInternalServerError)
		return
	}
	if reqs == nil {
		reqs = []*store.QuicknoteAccessRequest{}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(reqs)
}

// ApproveQuicknoteAccessRequest approves a user's access request for a quicknote (owner only).
func (h *QuicknoteHandler) ApproveQuicknoteAccessRequest(w http.ResponseWriter, r *http.Request) {
	h.resolveQuicknoteAccessRequest(w, r, "approved")
}

// DenyQuicknoteAccessRequest denies a user's access request and evicts them from the active room (owner only).
func (h *QuicknoteHandler) DenyQuicknoteAccessRequest(w http.ResponseWriter, r *http.Request) {
	h.resolveQuicknoteAccessRequest(w, r, "denied")
}

func (h *QuicknoteHandler) resolveQuicknoteAccessRequest(w http.ResponseWriter, r *http.Request, status string) {
	callerID, ok := r.Context().Value("user_id").(string)
	if !ok || callerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	targetUserID := strings.TrimSpace(chi.URLParam(r, "userID"))
	if slug == "" || targetUserID == "" {
		http.Error(w, "slug and userID are required", http.StatusBadRequest)
		return
	}

	qn, err := h.store.GetQuicknoteBySlug(r.Context(), slug)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		log.Printf("[Quicknote] Failed to load quicknote %s: %v", slug, err)
		http.Error(w, "Failed to load quicknote", http.StatusInternalServerError)
		return
	}

	if qn.OwnerID == nil || *qn.OwnerID != callerID {
		http.Error(w, "Forbidden: only the quicknote owner can resolve access requests", http.StatusForbidden)
		return
	}

	if err := h.store.ResolveQuicknoteAccessRequest(r.Context(), slug, targetUserID, status); err != nil {
		if errors.Is(err, store.ErrNotFound) || errors.Is(err, sql.ErrNoRows) {
			http.Error(w, "Quicknote not found", http.StatusNotFound)
			return
		}
		log.Printf("[Quicknote] Failed to resolve access request for %s user %s: %v", slug, targetUserID, err)
		http.Error(w, "Failed to resolve access request", http.StatusInternalServerError)
		return
	}

	if status == "denied" {
		hub := h.hub
		if hub == nil {
			hub = GlobalHub
		}
		hub.EvictUserFromRoom("quicknote:"+slug, targetUserID)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{
		"status":  status,
		"user_id": targetUserID,
	})
}

// ServeWs upgrades HTTP to WebSocket and handles collaborative editing for quicknotes.
func (h *QuicknoteHandler) ServeWs(w http.ResponseWriter, r *http.Request) {
	slug := strings.TrimSpace(chi.URLParam(r, "slug"))
	if slug == "" {
		http.Error(w, "slug is required", http.StatusBadRequest)
		return
	}

	qn, callerID, _, ok := h.authorizeQuicknote(w, r, slug, true)
	if !ok {
		return
	}

	var yClientID uint32
	if yClientStr := r.URL.Query().Get("yClientId"); yClientStr != "" {
		if val, err := strconv.ParseUint(yClientStr, 10, 32); err == nil {
			yClientID = uint32(val)
		}
	}

	userID := callerID
	if userID == "" && (qn.AccessMode == "" || qn.AccessMode == "open") {
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
