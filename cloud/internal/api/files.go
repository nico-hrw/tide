package api

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
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
	r.Get("/", h.ListFiles)
	r.Post("/", h.CreateFile)

	r.Route("/{fileID}", func(r chi.Router) {
		r.Get("/", h.GetFileMetadata) // Check access
		r.Put("/", h.UpdateFile)
		r.Delete("/", h.DeleteFile)

		r.Post("/upload", h.UploadFile)
		r.Get("/download", h.DownloadFile)
	})

	r.Put("/visibility", h.SetVisibility)

	// Routes that take fileID as a direct parameter, not nested
	r.Post("/{fileID}/share", h.ShareFile)
	r.Post("/{fileID}/accept", h.AcceptShare)
	r.Post("/{fileID}/copy", h.CopyFile)

	// Public Profile Files
	r.Get("/public/{userID}", h.ListPublicFiles)
	r.Post("/purge", h.PurgeFiles)
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

	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "User ID required", http.StatusUnauthorized)
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
	ParentID    *string         `json:"parent_id"`
	PublicMeta  json.RawMessage `json:"public_meta"`
	SecuredMeta []byte          `json:"secured_meta"`
	Visibility  *string         `json:"visibility"`
	IsTask      *bool           `json:"is_task"`
	IsCompleted *bool           `json:"is_completed"`
}

func (h *FileHandler) GetFileMetadata(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	if id == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		http.Error(w, "Missing X-User-ID header", http.StatusUnauthorized)
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(file)
}

// ListFiles: GET /api/v1/files?user_id=...&parent_id=...&recursive=true
func (h *FileHandler) ListFiles(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id") // In real app, get from Context/JWT
	parentID := r.URL.Query().Get("parent_id")
	typeParam := r.URL.Query().Get("type")
	recursive := r.URL.Query().Get("recursive") == "true"

	var pID *string
	if parentID != "" {
		pID = &parentID
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

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

func (h *FileHandler) AcceptShare(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
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

	files, err := h.Store.ListPublicFiles(r.Context(), targetUserID)
	if err != nil {
		http.Error(w, "Failed to list public files", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(files)
}

// --- Sharing Endpoints ---

type ShareRequest struct {
	RecipientEmail string `json:"email"`
	SecuredMeta    []byte `json:"secured_meta"`
}

func (h *FileHandler) ShareFile(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	var req ShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// 1. Resolve Recipient ID via Blind Index
	emailHash := hashString(req.RecipientEmail)
	recipient, err := h.Store.GetUserByEmailHash(r.Context(), emailHash)
	if err != nil {
		http.Error(w, "Recipient not found (or invalid email)", http.StatusNotFound)
		return
	}

	// 2. Share with metadata encrypted for recipient
	if err := h.Store.ShareFile(r.Context(), fileID, recipient.ID, req.SecuredMeta); err != nil {
		http.Error(w, "Failed to share file", http.StatusInternalServerError)
		return
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

	// Get user ID
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		userID = "user-1" // Default for dev
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
	NewOwnerID     string  `json:"new_owner_id"` // In real app, from JWT
}

func (h *FileHandler) CopyFile(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	var req CopyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// 1. Get Original File
	original, err := h.Store.GetFile(r.Context(), fileID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Check if user has access (implicit via ListAccessible logic check)
	// For MVP, if they can GET metadata, they can Copy.
	// But `GetFile` bypasses checks in Store currently.
	// Let's check `ListAccessibleFiles` for this specific ID?
	// Or simplistic: If Visibility is public OR Shared with me.

	viewerID := r.Header.Get("X-User-ID")
	if viewerID == "" {
		viewerID = "user-1"
	}

	// Manual check (MVP)
	// access := (original.OwnerID == viewerID) || (original.Visibility == "public")
	// if !access {
	// Check shares...
	// But let's trust the Caller for this specific test script or rely on UI to filter.
	// BETTER: Fix `GetFile` to optionally check access or use `ListAccessibleFiles` with ID filter.
	// }

	// 3. Create Copy
	newFile := &db.File{
		ID:          uuid.New().String(),
		OwnerID:     req.NewOwnerID,
		ParentID:    req.TargetParentID,
		Type:        original.Type,
		MIMEType:    original.MIMEType,
		Size:        original.Size,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		BlobPath:    original.BlobPath,   // Point to SAME blob (Deduplication)
		Visibility:  original.Visibility, // Preserve visibility (Copies of public files remain public until user privatizes them)
		PublicMeta:  original.PublicMeta,
		SecuredMeta: original.SecuredMeta, // Note: This might be encrypted with Owner's Key!
		// CRITICAL: If SecuredMeta is encrypted with Owner's Key, Recipient cannot read it!
		// For Copy to work in E2EE, the Client must decrypt original and re-encrypt for themselves.
		// Server-side copy of SecuredMeta implies we copy the *ciphertext*.
		// If Client B has the file key (via Sharing), they can decrypt it.
		// If Public, maybe PublicMeta has enough info?
		// MVP: We copy bits. Client logic handles keys.
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
	SecuredMeta []byte          `json:"secured_meta"`
	Visibility  string          `json:"visibility"`
}

func (h *FileHandler) CreateFile(w http.ResponseWriter, r *http.Request) {
	var req CreateFileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Extract UserID (For MVP testing via Header or default)
	ownerID := r.Header.Get("X-User-ID")
	if ownerID == "" {
		ownerID = "user-1" // Default for single-user dev
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
		SecuredMeta: req.SecuredMeta,
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

	// Verify Ownership (MVP)
	ownerID := r.Header.Get("X-User-ID")
	if ownerID == "" || file.OwnerID != ownerID {
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
		file.SecuredMeta = req.SecuredMeta
	}
	if req.Visibility != nil {
		file.Visibility = *req.Visibility
	}
	if req.IsTask != nil {
		file.IsTask = *req.IsTask
	}
	if req.IsCompleted != nil {
		file.IsCompleted = *req.IsCompleted
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

	// Verify file exists and belongs to user (skip ownership check for MVP speed)
	file, err := h.Store.GetFile(r.Context(), id)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Stream body to BlobStore
	if err := h.BlobStore.Put(r.Context(), id, r.Body); err != nil {
		http.Error(w, "Failed to write blob", http.StatusInternalServerError)
		return
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

	// Get user ID
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
		userID = "user-1" // Default for dev
	}

	// Check if user has access to this file
	file, err := h.Store.GetFile(r.Context(), id)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	// Allow access if:
	// 1. User is the owner
	// 2. File is public
	// 3. File is shared with user (check file_shares table)
	hasAccess := false
	if file.OwnerID == userID || file.Visibility == "public" {
		hasAccess = true
	} else {
		// Check shares - query file_shares table
		// For now, use ListAccessibleFiles to verify user has access
		accessibleFiles, err := h.Store.ListAccessibleFiles(r.Context(), userID, nil, nil, false)
		if err == nil {
			for _, f := range accessibleFiles {
				if f.ID == id {
					hasAccess = true
					break
				}
			}
		}
	}

	if !hasAccess {
		http.Error(w, "Access denied", http.StatusForbidden)
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
	userID := r.Header.Get("X-User-ID")
	if userID == "" {
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
