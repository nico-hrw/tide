package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
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
	Hub       *Hub
}

func NewFileHandler(s *store.SQLiteStore, b store.BlobStore, broker *Broker) *FileHandler {
	return &FileHandler{Store: s, BlobStore: b, Broker: broker, Hub: GlobalHub}
}

func (h *FileHandler) RegisterRoutes(r chi.Router) {
	// Public routes
	r.Get("/public/{userID}", h.ListPublicFiles)
	r.Get("/public/{userID}/download/{fileID}", h.DownloadPublicFile)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(AuthMiddleware)

		r.Get("/", h.ListFiles)
		r.Post("/", h.CreateFile)

		// Specific actions on files
		r.Post("/{fileID}/share", h.ShareFile)
		r.Post("/{fileID}/accept", h.AcceptShare)
		r.Post("/{fileID}/copy", h.CopyFile)
		r.Get("/{fileID}/shares", h.ListShares)
		r.Patch("/{fileID}/shares/{userID}", h.UpdateSharePermissionEndpoint)
		r.Delete("/{fileID}/shares/{userID}", h.RevokeShare)

		r.Get("/{fileID}", h.GetFileMetadata)
		r.Put("/{fileID}", h.UpdateFile)
		r.Patch("/{fileID}", h.UpdateFile)
		r.Delete("/{fileID}", h.DeleteFile)
		r.Post("/{fileID}/upload", h.UploadFile)
		r.Get("/{fileID}/download", h.DownloadFile)
		r.Get("/{fileID}/backups", h.GetFileBackups)
		r.Get("/{fileID}/backups/{slotName}", h.GetFileBackup)
		r.Put("/{fileID}/backups/{slotName}", h.UpdateFileBackup)
		r.Post("/{fileID}/restore", h.RestoreFile)

		r.Get("/{fileID}/crdt-state", h.GetCRDTState)
		r.Post("/{fileID}/compact", h.CompactYjsWAL)
		r.Post("/{fileID}/revoke-and-rotate", h.RevokeAndRotate)

		r.Put("/visibility", h.SetVisibility)
		r.Post("/purge", h.PurgeFiles)
	})

	// Register WebSocket endpoint for Live Sync
	r.Get("/{fileID}/ws", h.ServeWs)
}
func (h *FileHandler) broadcastToFileUsers(fileID string, ownerID string, message string) {
	go h.Broker.Broadcast(ownerID, message)
	shares, err := h.Store.ListSharesForFile(context.Background(), fileID)
	if err == nil {
		for _, s := range shares {
			go h.Broker.Broadcast(s.UserID, message)
		}
	}
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
			http.Error(w, "File not found", http.StatusNotFound)
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

	trashed := r.URL.Query().Get("trashed") == "true"
	if trashed {
		files, err := h.Store.ListTrashedFiles(r.Context(), userID)
		if err != nil {
			http.Error(w, "Failed to list trashed files", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(files)
		return
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

type CreateFileRequest struct {
	ID          *string         `json:"id,omitempty"`
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

func isValidVisibility(v string) bool {
	return v == "private" || v == "public" || v == "contacts"
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
	} else if !isValidVisibility(visibility) {
		http.Error(w, "Invalid visibility value", http.StatusBadRequest)
		return
	}

	fileID := uuid.New().String()
	if req.ID != nil && *req.ID != "" {
		parsedID, err := uuid.Parse(*req.ID)
		if err != nil {
			http.Error(w, "Invalid file ID format", http.StatusBadRequest)
			return
		}
		fileID = parsedID.String()
		if _, err := h.Store.GetFile(r.Context(), fileID); err == nil {
			http.Error(w, "File ID already exists", http.StatusConflict)
			return
		} else if !errors.Is(err, store.ErrNotFound) {
			http.Error(w, "Failed to verify file ID availability", http.StatusInternalServerError)
			return
		}
		existsInQuicknotes, qnErr := h.Store.QuicknoteFileExists(r.Context(), fileID)
		if qnErr != nil {
			log.Printf("CreateFile: QuicknoteFileExists error: %v", qnErr)
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		if existsInQuicknotes {
			http.Error(w, "File ID conflict", http.StatusConflict)
			return
		}
	}

	file := &db.File{
		ID:          fileID,
		OwnerID:     ownerID,
		ParentID:    req.ParentID,
		Type:        req.Type,
		MIMEType:    req.MIMEType,
		Size:        req.Size,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Visibility:  visibility,
		PublicMeta:  req.PublicMeta,
		SecuredMeta: decodeBase64OrRaw(req.SecuredMeta),
		Version:     req.Version,
		Metadata:    req.Metadata,
		AccessKeys:  req.AccessKeys,
	}

	// Inherit access_keys and visibility from parent if not explicitly provided
	if req.ParentID != nil && *req.ParentID != "" {
		parentFile, err := h.Store.GetAccessibleFile(r.Context(), *req.ParentID, ownerID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				http.Error(w, "Forbidden: parent file not found or access denied", http.StatusForbidden)
				return
			}
			http.Error(w, "Failed to verify parent file access", http.StatusInternalServerError)
			return
		}
		if !store.CanWrite(parentFile.Permission) {
			http.Error(w, "Forbidden: write permission required on parent file", http.StatusForbidden)
			return
		}
		file.Visibility = parentFile.Visibility
		if req.AccessKeys == nil || len(req.AccessKeys) == 0 || string(req.AccessKeys) == "null" || string(req.AccessKeys) == "{}" {
			file.AccessKeys = parentFile.AccessKeys
		}
	}

	if file.Version == 0 {
		file.Version = 1
	}

	if err := h.Store.CreateFile(r.Context(), file); err != nil {
		http.Error(w, "Failed to create file meta", http.StatusInternalServerError)
		return
	}

	// Broadcast event
	if msgBytes, err := json.Marshal(map[string]string{"type": "file_created", "file_id": file.ID}); err == nil {
		h.broadcastToFileUsers(file.ID, ownerID, string(msgBytes))
	}

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

	requesterID, ok := r.Context().Value("user_id").(string)
	if !ok || requesterID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	// Owner has full access; otherwise the requester must have an accepted share with at least 'edit' permission.
	var sharePermission string
	if file.OwnerID != requesterID {
		var err error
		sharePermission, err = h.Store.GetSharePermission(r.Context(), id, requesterID)
		if err != nil || (sharePermission != "edit" && sharePermission != "share") {
			http.Error(w, "Forbidden: read-only access", http.StatusForbidden)
			return
		}
	}
	_ = requesterID // used above; keep variable in scope

	// Update fields
	if req.ParentID != nil {
		// Sentinel: "__none__" means "set parent_id to NULL" (can't distinguish
		// absent vs null with Go *string JSON parsing)
		if *req.ParentID == "__none__" || *req.ParentID == "" {
			file.ParentID = nil
		} else {
			if *req.ParentID == id {
				http.Error(w, "Cannot set file as its own parent", http.StatusBadRequest)
				return
			}
			parent, err := h.Store.GetAccessibleFile(r.Context(), *req.ParentID, requesterID)
			if err != nil {
				if errors.Is(err, store.ErrNotFound) {
					http.Error(w, "Forbidden: parent file not found or access denied", http.StatusForbidden)
					return
				}
				http.Error(w, "Failed to verify parent file access", http.StatusInternalServerError)
				return
			}
			if !store.CanWrite(parent.Permission) {
				http.Error(w, "Forbidden: write permission required on parent file", http.StatusForbidden)
				return
			}
			// Walk parent chain up to 100 steps to reject circular reparenting
			curr := parent
			for step := 0; step < 100; step++ {
				if curr.ParentID == nil || *curr.ParentID == "" {
					break
				}
				if *curr.ParentID == id {
					http.Error(w, "Cannot move a folder into its own descendant", http.StatusBadRequest)
					return
				}
				nextParent, err := h.Store.GetFile(r.Context(), *curr.ParentID)
				if err != nil {
					if errors.Is(err, store.ErrNotFound) {
						break
					}
					http.Error(w, "Failed to verify parent hierarchy", http.StatusInternalServerError)
					return
				}
				curr = nextParent
				if step == 99 {
					http.Error(w, "Parent hierarchy depth limit exceeded", http.StatusBadRequest)
					return
				}
			}
			file.ParentID = req.ParentID
		}
	}
	if req.PublicMeta != nil {
		file.PublicMeta = req.PublicMeta
	}
	if req.SecuredMeta != nil {
		if file.OwnerID == requesterID {
			file.SecuredMeta = decodeBase64OrRaw(*req.SecuredMeta)
		} else {
			// If a collaborator updates secured_meta (e.g. rename), update their own entry in file_shares
			canReshare := false
			if share, err := h.Store.GetShare(r.Context(), id, requesterID); err == nil && share != nil {
				canReshare = share.CanReshare
			}
			_ = h.Store.ShareFileWithPermission(r.Context(), id, requesterID, decodeBase64OrRaw(*req.SecuredMeta), sharePermission, canReshare)
		}
	}
	if req.Visibility != nil {
		if !isValidVisibility(*req.Visibility) {
			http.Error(w, "Invalid visibility value", http.StatusBadRequest)
			return
		}
		if *req.Visibility != file.Visibility {
			if file.OwnerID != requesterID {
				http.Error(w, "Only the owner can change file visibility", http.StatusForbidden)
				return
			}
			file.Visibility = *req.Visibility
		}
	}
	var oldUnencrypted, newUnencrypted bool
	if req.Metadata != nil {
		var oldMeta, newMeta struct {
			Unencrypted bool `json:"unencrypted"`
		}
		if len(file.Metadata) > 0 {
			_ = json.Unmarshal(file.Metadata, &oldMeta)
		}
		if len(req.Metadata) > 0 {
			_ = json.Unmarshal(req.Metadata, &newMeta)
		}
		oldUnencrypted = oldMeta.Unencrypted
		newUnencrypted = newMeta.Unencrypted
		file.Metadata = req.Metadata
	}
	if req.AccessKeys != nil && file.OwnerID == requesterID {
		file.AccessKeys = req.AccessKeys
	}
	if req.ContentCiphertext != nil {
		const maxBackupCascadeBytes = 10 * 1024 * 1024
		var oldBlobBytes []byte
		if oldSize, sizeErr := h.BlobStore.GetSize(r.Context(), id); sizeErr == nil && oldSize > 0 && oldSize <= maxBackupCascadeBytes {
			if oldRc, blobErr := h.BlobStore.Get(r.Context(), id); blobErr == nil {
				readBytes, readErr := io.ReadAll(io.LimitReader(oldRc, maxBackupCascadeBytes+1))
				oldRc.Close()
				if readErr == nil && int64(len(readBytes)) <= maxBackupCascadeBytes {
					oldBlobBytes = readBytes
				}
			}
		}

		if err := h.BlobStore.Put(r.Context(), id, strings.NewReader(*req.ContentCiphertext)); err != nil {
			http.Error(w, "Failed to write blob", http.StatusInternalServerError)
			return
		}
		path := id
		file.BlobPath = &path

		// Server-side backup cascade: maintains the "1 week" full-copy base slot
		if len(oldBlobBytes) > 0 {
			go h.handleBackupCascade(context.Background(), id, oldBlobBytes)
		}
	}
	file.UpdatedAt = time.Now()

	var updateErr error
	if req.Version != nil {
		updateErr = h.Store.UpdateFileWithOCC(r.Context(), file, *req.Version)
		if errors.Is(updateErr, store.ErrVersionConflict) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusConflict)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"error":           "conflict",
				"message":         "File has been modified by another session",
				"current_version": file.Version,
			})
			return
		}
	} else {
		updateErr = h.Store.UpdateFile(r.Context(), file)
	}

	if updateErr != nil {
		http.Error(w, "Failed to update file", http.StatusInternalServerError)
		return
	}

	// Wipe stale CRDT snapshots & WAL entries when a note transitions between encrypted and unencrypted
	if file.Type == db.FileTypeNote && oldUnencrypted != newUnencrypted {
		if resetter, ok := interface{}(h.Store).(interface {
			ResetFileCRDTState(context.Context, string, bool) error
		}); ok {
			if err := resetter.ResetFileCRDTState(r.Context(), file.ID, true); err != nil {
				log.Printf("UpdateFile: ResetFileCRDTState failed for file %s: %v", file.ID, err)
			}
		}
	}

	// Broadcast event
	if msgBytes, err := json.Marshal(map[string]string{"type": "file_updated", "file_id": file.ID}); err == nil {
		h.broadcastToFileUsers(file.ID, file.OwnerID, string(msgBytes))
	}

	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(file)
}

func decodeBase64OrRaw(s string) []byte {
	if s == "" {
		return nil
	}
	dec, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return []byte(s)
	}
	return dec
}
