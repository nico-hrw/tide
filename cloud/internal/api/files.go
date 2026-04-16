package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type FileHandler struct {
	Store     *store.SQLiteStore
	BlobStore store.BlobStore
	Broker    *Broker
}

func NewFileHandler(s *store.SQLiteStore, b store.BlobStore, broker *Broker) *FileHandler {
	return &FileHandler{Store: s, BlobStore: b, Broker: broker}
}

func (h *FileHandler) RegisterRoutes(r chi.Router) {
	// Public routes
	r.Get("/public/{userID}", h.ListPublicFiles)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(AuthMiddleware)

		r.Get("/", h.ListFiles)
		r.Post("/", h.CreateFile)

		// Specific actions on files
		r.Post("/{fileID}/share", h.ShareFile)
		r.Post("/{fileID}/accept", h.AcceptShare)
		r.Post("/{fileID}/copy", h.CopyFile)

		r.Get("/{fileID}", h.GetFileMetadata)
		r.Put("/{fileID}", h.UpdateFile)
		r.Delete("/{fileID}", h.DeleteFile)
		r.Post("/{fileID}/upload", h.UploadFile)
		r.Get("/{fileID}/download", h.DownloadFile)
		r.Get("/{fileID}/backups", h.GetFileBackups)
		r.Get("/{fileID}/backups/{slotName}", h.GetFileBackup)

		r.Put("/visibility", h.SetVisibility)
		r.Post("/purge", h.PurgeFiles)
	})
}

func (h *FileHandler) DeleteFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	if id == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	// Check ownership
	file, err := h.Store.GetFile(r.Context(), id)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		// If we can't find the file, maybe it was a share that is now broken?
		// But GetFile usually returns shares too if we look up by ID?
		// Actually Store.GetFile gets by ID from 'files' table.
		// If I am a sharee, the file exists in 'files' table.
		http.Error(w, "Failed to get file", http.StatusInternalServerError)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if file.OwnerID == userID {
		// Owner: Delete File
		if err := h.Store.DeleteFile(r.Context(), id); err != nil {
			http.Error(w, "Failed to delete file", http.StatusInternalServerError)
			return
		}
		// Broadcast
		go h.Broker.Broadcast(userID, fmt.Sprintf(`{"type":"file_deleted","file_id":"%s"}`, id))
	} else {
		// Not Owner: Remove Share
		if err := h.Store.RemoveShare(r.Context(), id, userID); err != nil {
			if err == store.ErrNotFound {
				// Share not found?
				http.Error(w, "Share not found", http.StatusNotFound)
				return
			}
			http.Error(w, "Failed to remove share", http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

type UpdateFileRequest struct {
	ParentID          *string         `json:"parent_id"`
	PublicMeta        json.RawMessage `json:"public_meta"`
	SecuredMeta       *string         `json:"secured_meta"`
	Visibility        *string         `json:"visibility"`
	Version           *int            `json:"version"`
	Metadata          json.RawMessage `json:"metadata"`
	AccessKeys        json.RawMessage `json:"access_keys"`
	ContentCiphertext *string         `json:"content_ciphertext"`
}

func (h *FileHandler) GetFileMetadata(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	if id == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	// Read securely from context (set by AuthMiddleware)
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Use GetAccessibleFile to get the correct metadata for the viewer (Self/Shared)
	file, err := h.Store.GetAccessibleFile(r.Context(), id, userID)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "File not found or inaccessible", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to retrieve file metadata", http.StatusInternalServerError)
		return
	}
	if file.Version == 0 {
		file.Version = 1
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(file)
}

// ListFiles: GET /api/v1/files?parent_id=...&recursive=true
func (h *FileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	// Read securely from context (set by AuthMiddleware)
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	parentID := r.URL.Query().Get("parent_id")
	typeParam := r.URL.Query().Get("type")
	recursive := r.URL.Query().Get("recursive") == "true"

	var pID *string
	if parentID != "" {
		pID = &parentID
	} else if !recursive && typeParam != "event" {
		// If not recursive and no parent ID provided (and not events which we might flat fetch),
		// we explicitly want the root (parent_id IS NULL).
		// Our SQLite store handles pID == nil as root if recursive is false.
	}

	var tFilter *string
	if typeParam != "" {
		tFilter = &typeParam
	}

	// Use ListAccessibleFiles to show Own + Shared
	files, err := h.Store.ListAccessibleFiles(r.Context(), userID, pID, tFilter, recursive)
	if err != nil {
		http.Error(w, "Failed to list files", http.StatusInternalServerError)
		return
	}

	for _, f := range files {
		if f.Version == 0 {
			f.Version = 1
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func (h *FileHandler) AcceptShare(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	if err := h.Store.AcceptShare(r.Context(), fileID, userID); err != nil {
		http.Error(w, "Failed to accept share", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Accepted successfully"}`))
}

func (h *FileHandler) ListPublicFiles(w http.ResponseWriter, r *http.Request) {
	targetUserID := chi.URLParam(r, "userID")

	viewerID, _ := r.Context().Value("user_id").(string)
	files, err := h.Store.ListPublicFiles(r.Context(), targetUserID, viewerID)
	if err != nil {
		http.Error(w, "Failed to list public files", http.StatusInternalServerError)
		return
	}

	if files == nil {
		files = []*db.File{}
	}

	for _, f := range files {
		if f.Version == 0 {
			f.Version = 1
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// --- Sharing Endpoints ---

type ShareRequest struct {
	RecipientEmail string `json:"email"`
	SecuredMeta    string `json:"secured_meta"`
}

func (h *FileHandler) ShareFile(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	var req ShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// [FIX HOCH-3] Verify that the requesting user is the file owner before
	// touching file_shares or the access_keys map.
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	file, err := h.Store.GetFile(r.Context(), fileID)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to retrieve file", http.StatusInternalServerError)
		return
	}
	if file.OwnerID != userID {
		http.Error(w, "Forbidden: only the file owner can share this file", http.StatusForbidden)
		return
	}

	// 1. Resolve Recipient ID via Blind Index
	emailHash := hashString(req.RecipientEmail)
	recipient, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		http.Error(w, "Recipient not found (or invalid email)", http.StatusNotFound)
		return
	}

	// 2. Insert into file_shares (pending status, SecuredMeta = wrapped DEK for recipient)
	if err := h.Store.ShareFile(r.Context(), fileID, recipient.ID, []byte(req.SecuredMeta)); err != nil {
		http.Error(w, "Failed to share file", http.StatusInternalServerError)
		return
	}

	// 3. [V2-FIX] Atomically update the file's access_keys map so the recipient can unwrap the DEK.
	//    Using json_set avoids the read-modify-write race when two shares happen concurrently.
	if req.SecuredMeta != "" {
		wrappedKeyJSON, _ := json.Marshal(map[string]string{"wrapped_key": req.SecuredMeta})
		// recipient.ID is a UUID fetched from DB — safe to use in json_set path.
		jsonPath := fmt.Sprintf("'$.%s'", recipient.ID)
		query := fmt.Sprintf(
			`UPDATE files SET access_keys = json_set(COALESCE(NULLIF(access_keys, ''), '{}'), %s, json(?)), updated_at = ? WHERE id = ?`,
			jsonPath,
		)
		if _, dbErr := h.Store.DB.ExecContext(r.Context(), query, string(wrappedKeyJSON), time.Now(), fileID); dbErr != nil {
			log.Printf("[SHARE] Warning: atomic access_keys update failed for file %s: %v", fileID, dbErr)
		}
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Shared successfully"}`))
}

type VisibilityRequest struct {
	FileID     string `json:"file_id"`
	Visibility string `json:"visibility"` // 'public' or 'private'
}

func (h *FileHandler) SetVisibility(w http.ResponseWriter, r *http.Request) {
	var req VisibilityRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[ERROR] SetVisibility: Failed to decode body: %v", err)
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}
	log.Printf("[DEBUG] SetVisibility: FileID=%s, Visibility=%s", req.FileID, req.Visibility)

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	log.Printf("[DEBUG] SetVisibility: UserID=%s", userID)

	// Get file to verify ownership
	file, err := h.Store.GetFile(r.Context(), req.FileID)
	if err != nil {
		log.Printf("[ERROR] SetVisibility: File not found: %s", req.FileID)
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Check ownership
	if file.OwnerID != userID {
		log.Printf("[ERROR] SetVisibility: Unauthorized. Owner=%s, Requester=%s", file.OwnerID, userID)
		http.Error(w, "Not authorized - you don't own this file", http.StatusForbidden)
		return
	}

	if err := h.Store.SetVisibility(r.Context(), req.FileID, req.Visibility); err != nil {
		log.Printf("[ERROR] SetVisibility: Store error: %v", err)
		http.Error(w, "Failed to set visibility", http.StatusInternalServerError)
		return
	}

	// Recursive update for folders set to public
	if file.Type == "folder" && req.Visibility == "public" {
		go func() {
			err := h.Store.SetVisibilityRecursive(context.Background(), req.FileID, req.Visibility)
			if err != nil {
				log.Printf("[ERROR] SetVisibilityRecursive failed for %s: %v", req.FileID, err)
			}
		}()
	}

	log.Printf("[DEBUG] SetVisibility: Success for FileID=%s", req.FileID)
	w.WriteHeader(http.StatusOK)
}

type CopyRequest struct {
	TargetParentID *string `json:"target_parent_id"`
	// NewOwnerID intentionally removed: owner is ALWAYS the authenticated user (viewerID from JWT).
	// Accepting owner_id from the request body was a Privilege Escalation vulnerability.
}

func (h *FileHandler) CopyFile(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	var req CopyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	viewerID, ok := r.Context().Value("user_id").(string)
	if !ok || viewerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Use GetAccessibleFile to enforce ownership/share access control.
	// GetFile bypasses these checks and allowed any authenticated user to copy
	// any file by UUID — a privilege escalation risk.
	original, err := h.Store.GetAccessibleFile(r.Context(), fileID, viewerID)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "File not found or access denied", http.StatusForbidden)
			return
		}
		http.Error(w, "Failed to retrieve file", http.StatusInternalServerError)
		return
	}

	// OwnerID is ALWAYS the requesting user (viewerID from JWT) — never from request body.
	newFile := &db.File{
		ID:          uuid.New().String(),
		OwnerID:     viewerID,
		ParentID:    req.TargetParentID,
		Type:        original.Type,
		MIMEType:    original.MIMEType,
		Size:        original.Size,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		BlobPath:    original.BlobPath,
		Visibility:  original.Visibility,
		PublicMeta:  original.PublicMeta,
		SecuredMeta: original.SecuredMeta,
		// NOTE: access_keys and metadata are intentionally NOT copied.
		// The client must re-encrypt the content for their own key after copying.
	}

	if err := h.Store.CreateFile(r.Context(), newFile); err != nil {
		http.Error(w, "Failed to copy file", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(newFile)
}


type CreateFileRequest struct {
	ParentID    *string         `json:"parent_id"`
	Type        db.FileType     `json:"type"`
	MIMEType    *string         `json:"mime_type"`
	Size        int64           `json:"size"`
	PublicMeta  json.RawMessage `json:"public_meta"`
	SecuredMeta string          `json:"secured_meta"`
	Visibility  string          `json:"visibility"`
	Version     int             `json:"version"`
	Metadata    json.RawMessage `json:"metadata"`
	AccessKeys  json.RawMessage `json:"access_keys"`
}

func (h *FileHandler) CreateFile(w http.ResponseWriter, r *http.Request) {
	var req CreateFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	ownerID, ok := r.Context().Value("user_id").(string)
	if !ok || ownerID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	visibility := req.Visibility
	if visibility == "" {
		visibility = "private"
	}

	file := &db.File{
		ID:          uuid.New().String(),
		OwnerID:     ownerID,
		ParentID:    req.ParentID,
		Type:        req.Type,
		MIMEType:    req.MIMEType,
		Size:        req.Size,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Visibility:  visibility,
		PublicMeta:  req.PublicMeta,
		SecuredMeta: []byte(req.SecuredMeta),
		Version:     req.Version,
		Metadata:    req.Metadata,
		AccessKeys:  req.AccessKeys,
	}
	if file.Version == 0 {
		file.Version = 1
	}

	if err := h.Store.CreateFile(r.Context(), file); err != nil {
		http.Error(w, "Failed to create file meta", http.StatusInternalServerError)
		return
	}

	// Broadcast event
	go h.Broker.Broadcast(ownerID, fmt.Sprintf(`{"type":"file_created","file_id":"%s"}`, file.ID))

	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(file)
}

func (h *FileHandler) UpdateFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	if id == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	var req UpdateFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	file, err := h.Store.GetFile(r.Context(), id)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	ownerID, ok := r.Context().Value("user_id").(string)
	if !ok || ownerID == "" || file.OwnerID != ownerID {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Update fields
	if req.ParentID != nil {
		file.ParentID = req.ParentID
	}
	if req.PublicMeta != nil {
		file.PublicMeta = req.PublicMeta
	}
	if req.SecuredMeta != nil {
		file.SecuredMeta = []byte(*req.SecuredMeta)
	}
	if req.Visibility != nil {
		file.Visibility = *req.Visibility
	}
	if req.Version != nil {
		file.Version = *req.Version
	}
	if req.Metadata != nil {
		file.Metadata = req.Metadata
	}
	if req.AccessKeys != nil {
		file.AccessKeys = req.AccessKeys
	}
	if req.ContentCiphertext != nil {
		oldRc, err := h.BlobStore.Get(r.Context(), id)
		var oldBlobBytes []byte
		if err == nil {
			oldBlobBytes, _ = io.ReadAll(oldRc)
			oldRc.Close()
		}

		if err := h.BlobStore.Put(r.Context(), id, strings.NewReader(*req.ContentCiphertext)); err != nil {
			http.Error(w, "Failed to write blob", http.StatusInternalServerError)
			return
		}
		path := id
		file.BlobPath = &path

		if len(oldBlobBytes) > 0 {
			go h.handleBackupCascade(context.Background(), id, oldBlobBytes)
		}
	}
	file.UpdatedAt = time.Now()

	if err := h.Store.UpdateFile(r.Context(), file); err != nil {
		http.Error(w, "Failed to update file", http.StatusInternalServerError)
		return
	}

	// Broadcast event
	go h.Broker.Broadcast(file.OwnerID, fmt.Sprintf(`{"type":"file_updated","file_id":"%s"}`, file.ID))

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(file)
}

func (h *FileHandler) UploadFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	if id == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	// [FIX KRIT-1] Verify ownership before allowing a blob upload/overwrite.
	// GetFile alone does not enforce ownership; an attacker with a valid JWT could
	// overwrite any file's blob by guessing its UUID.
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	file, err := h.Store.GetFile(r.Context(), id)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	if file.OwnerID != userID {
		http.Error(w, "Forbidden: only the file owner can upload content", http.StatusForbidden)
		return
	}

	oldRc, err := h.BlobStore.Get(r.Context(), id)
	var oldBlobBytes []byte
	if err == nil {
		oldBlobBytes, _ = io.ReadAll(oldRc)
		oldRc.Close()
	}

	// Stream body to BlobStore
	if err := h.BlobStore.Put(r.Context(), id, r.Body); err != nil {
		http.Error(w, "Failed to write blob", http.StatusInternalServerError)
		return
	}

	if len(oldBlobBytes) > 0 {
		go h.handleBackupCascade(context.Background(), id, oldBlobBytes)
	}

	// Update file blob path (if not already set, though BlobStore abstracts path)
	// We might want to mark it as "uploaded" or update size.
	// For now, just assume it's there.
	path := id // logic in LocalBlobStore uses ID as filename
	file.BlobPath = &path
	h.Store.UpdateFile(r.Context(), file)

	w.WriteHeader(http.StatusOK)
}

func (h *FileHandler) DownloadFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	if id == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// Check if user has access to this file
	file, err := h.Store.GetAccessibleFile(r.Context(), id, userID)
	if err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "File not found or access denied", http.StatusForbidden)
			return
		}
		http.Error(w, "Failed to verify access", http.StatusInternalServerError)
		return
	}

	// CRITICAL: Use BlobPath for lookup, not file.ID
	// This is essential for copied files which point to the original blob.
	// Fallback to file.ID if BlobPath is not set
	lookupID := id
	if file.BlobPath != nil && *file.BlobPath != "" {
		lookupID = *file.BlobPath
	}

	log.Printf("[DEBUG] DownloadFile: fileID=%s, lookupID=%s, visibility=%s", id, lookupID, file.Visibility)

	rc, err := h.BlobStore.Get(r.Context(), lookupID)
	if err != nil {
		log.Printf("[ERROR] DownloadFile: Blob not found key=%s: %v", lookupID, err)
		http.Error(w, "Blob not found", http.StatusNotFound)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	io.Copy(w, rc)
}

func (h *FileHandler) PurgeFiles(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// 1. Get all files for this user (Recursive)
	files, err := h.Store.ListAccessibleFiles(r.Context(), userID, nil, nil, true)
	if err != nil {
		log.Printf("[PURGE] Failed to list files: %v", err)
		http.Error(w, "Failed to list files", http.StatusInternalServerError)
		return
	}

	purgedCount := 0
	for _, f := range files {
		// Only check user's OWN files
		if f.OwnerID != userID {
			continue
		}

		// Only check files with blob paths
		if f.Type == "folder" || f.BlobPath == nil || *f.BlobPath == "" {
			continue
		}

		// Simple existence check in BlobStore
		exists := h.BlobStore.Exists(r.Context(), *f.BlobPath)
		if !exists {
			// Delete from DB
			log.Printf("[PURGE] Deleting broken file record: %s (blob missing: %s)", f.ID, *f.BlobPath)
			if err := h.Store.DeleteFile(r.Context(), f.ID); err == nil {
				purgedCount++
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"message":      fmt.Sprintf("Purged %d broken files", purgedCount),
		"purged_count": purgedCount,
	})
}

func (h *FileHandler) GetFileBackups(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")

	// [FIX HOCH-1] Verify the caller has access to the parent file before returning
	// backup history. Without this check any authenticated user can enumerate all
	// historical versions of any file by guessing its UUID.
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if _, err := h.Store.GetAccessibleFile(r.Context(), id, userID); err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "File not found or access denied", http.StatusForbidden)
			return
		}
		http.Error(w, "Failed to verify file access", http.StatusInternalServerError)
		return
	}

	backups, err := h.Store.GetFileBackups(r.Context(), id)
	if err != nil {
		http.Error(w, "Failed to get backups", http.StatusInternalServerError)
		return
	}
	for i := range backups {
		backups[i].EncryptedBlob = nil
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(backups)
}

func (h *FileHandler) GetFileBackup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	slotName := chi.URLParam(r, "slotName")

	// [FIX HOCH-1] Same access check as GetFileBackups — caller must own or have
	// a valid share for the file to retrieve the encrypted blob of a specific slot.
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	if _, err := h.Store.GetAccessibleFile(r.Context(), id, userID); err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "File not found or access denied", http.StatusForbidden)
			return
		}
		http.Error(w, "Failed to verify file access", http.StatusInternalServerError)
		return
	}

	b, err := h.Store.GetFileBackup(r.Context(), id, slotName)
	if err != nil {
		http.Error(w, "Backup not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(b)
}

func (h *FileHandler) handleBackupCascade(ctx context.Context, id string, blobBytes []byte) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("RECOVERED in handleBackupCascade: %v", r)
		}
	}()

	if len(blobBytes) == 0 {
		return
	}
	backups, err := h.Store.GetFileBackups(ctx, id)
	if err != nil {
		return
	}

	now := time.Now()
	slotMap := make(map[string]*db.FileBackup)
	for i := range backups {
		slotMap[backups[i].SlotName] = &backups[i]
	}

	slots := []struct {
		name string
		dur  time.Duration
	}{
		{"10 minutes", 10 * time.Minute},
		{"30 minutes", 30 * time.Minute},
		{" 1 hour", 1 * time.Hour},
		{" 1 day", 24 * time.Hour},
		{" 2 days", 48 * time.Hour},
	}

	file, err := h.Store.GetFile(ctx, id)
	if err != nil {
		return
	}

	for _, slot := range slots {
		b := slotMap[slot.name]
		if b == nil || now.Sub(b.UpdatedAt) > slot.dur {
			newB := &db.FileBackup{
				ID:            uuid.New().String(),
				FileID:        id,
				SlotName:      slot.name,
				EncryptedBlob: blobBytes,
				SecuredMeta:   file.SecuredMeta,
				// [FIX MITTEL-6] Include V2 cryptographic metadata so the backup can be decrypted.
				// For V1 files: AccessKeys is nil/empty and Version is 1 — both safe defaults.
				// For V2 files: AccessKeys contains all wrapped DEKs (per-user); without this
				// the backup blob is an unrestorable ciphertext.
				AccessKeys: file.AccessKeys,
				Version:    file.Version,
				UpdatedAt:  now,
			}
			_ = h.Store.UpsertFileBackup(ctx, newB)
		}
	}
}
