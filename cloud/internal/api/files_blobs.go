package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/store"
)

type countingReader struct {
	r io.Reader
	n int64
}

func (c *countingReader) Read(p []byte) (int, error) {
	n, err := c.r.Read(p)
	c.n += int64(n)
	return n, err
}

func (h *FileHandler) UploadFile(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	if id == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	// [FIX KRIT-1] Verify access and write permission before allowing a blob upload/overwrite.
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	file, err := h.Store.GetAccessibleFile(r.Context(), id, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			http.Error(w, "File not found or access denied", http.StatusForbidden)
			return
		}
		http.Error(w, "Failed to verify access", http.StatusInternalServerError)
		return
	}

	parentFileID := ""
	if file.ParentFileID != nil && *file.ParentFileID != "" {
		parentFileID = *file.ParentFileID
	}

	canUpload := store.CanWrite(file.Permission)
	if !canUpload {
		http.Error(w, "Forbidden: write permission required to upload content", http.StatusForbidden)
		return
	}

	const maxStorage int64 = 250 * 1024 * 1024        // 250MB
	const maxFileUploadBytes int64 = 250 * 1024 * 1024 // 250MB
	remainingBytes := maxFileUploadBytes
	if parentFileID != "" {
		currentStorage, err := h.Store.GetFileTotalStorage(r.Context(), parentFileID)
		if err != nil {
			http.Error(w, "Failed to verify storage quota", http.StatusInternalServerError)
			return
		}
		if file.ParentFileID != nil && *file.ParentFileID == parentFileID {
			currentStorage -= file.Size
			if currentStorage < 0 {
				currentStorage = 0
			}
		}
		token := r.Header.Get("X-Access-Token")
		if token == "" {
			token = r.Header.Get("Authorization")
		}
		if !ValidateStorageExpandToken(r.Context(), h.Store, token) {
			remainingBytes = maxStorage - currentStorage
			if remainingBytes <= 0 {
				http.Error(w, "Storage limit exceeded", http.StatusRequestEntityTooLarge)
				return
			}
		}
	}

	if r.ContentLength > remainingBytes {
		http.Error(w, "Storage limit exceeded", http.StatusRequestEntityTooLarge)
		return
	}

	// Extend read/write deadlines so global http.Server timeouts do not abort large uploads.
	rcCtrl := http.NewResponseController(w)
	_ = rcCtrl.SetReadDeadline(time.Time{})
	_ = rcCtrl.SetWriteDeadline(time.Time{})

	r.Body = http.MaxBytesReader(w, r.Body, remainingBytes)
	cr := &countingReader{r: r.Body}

	const maxBackupCascadeBytes = 10 * 1024 * 1024 // 10MB
	var oldBlobBytes []byte
	if oldSize, sizeErr := h.BlobStore.GetSize(r.Context(), id); sizeErr == nil && oldSize > 0 && oldSize <= maxBackupCascadeBytes {
		if oldRc, blobErr := h.BlobStore.Get(r.Context(), id); blobErr == nil {
			oldBlobBytes, _ = io.ReadAll(io.LimitReader(oldRc, maxBackupCascadeBytes))
			oldRc.Close()
		}
	}

	// Stream body to BlobStore
	if err := h.BlobStore.Put(r.Context(), id, cr); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			http.Error(w, "Storage limit exceeded", http.StatusRequestEntityTooLarge)
			return
		}
		http.Error(w, "Failed to write blob", http.StatusInternalServerError)
		return
	}

	// Server-side backup cascade: maintains the "1 week" full-copy base slot
	if len(oldBlobBytes) > 0 {
		go h.handleBackupCascade(context.Background(), id, oldBlobBytes)
	}

	// Update file blob path (if not already set, though BlobStore abstracts path)
	// We might want to mark it as "uploaded" or update size.
	path := id // logic in LocalBlobStore uses ID as filename
	file.BlobPath = &path
	if parentFileID != "" {
		file.ParentFileID = &parentFileID
	}
	if file.ParentID == nil || *file.ParentID == "" {
		if parentFileID != "" {
			file.ParentID = &parentFileID
		}
	}
	file.Size = cr.n
	if err := h.Store.UpdateFile(r.Context(), file); err != nil {
		log.Printf("[ERROR] UploadFile: failed to update file %s: %v", id, err)
		http.Error(w, "Failed to update file metadata", http.StatusInternalServerError)
		return
	}

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
		if len(file.Content) > 0 {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("X-Content-Type-Options", "nosniff")
			w.Header().Set("Content-Disposition", "attachment")
			w.Write(file.Content)
			return
		}
		log.Printf("[ERROR] DownloadFile: Blob not found key=%s: %v", lookupID, err)
		http.Error(w, "Blob not found", http.StatusNotFound)
		return
	}
	defer rc.Close()

	rcCtrl := http.NewResponseController(w)
	_ = rcCtrl.SetWriteDeadline(time.Time{})

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "attachment")
	io.Copy(w, rc)
}

func (h *FileHandler) DownloadPublicFile(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "userID")
	fileID := chi.URLParam(r, "fileID")
	if fileID == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}
	if userID == "" {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	file, err := h.Store.GetFile(r.Context(), fileID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if file.OwnerID != userID {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}

	if len(file.Metadata) > 0 {
		var meta map[string]interface{}
		if err := json.Unmarshal(file.Metadata, &meta); err == nil && meta != nil {
			if deletedAt, exists := meta["deleted_at"]; exists && deletedAt != nil {
				if deletedStr, isStr := deletedAt.(string); isStr && deletedStr != "" {
					http.Error(w, "File not found", http.StatusNotFound)
					return
				}
			}
		}
	}

	if file.Visibility != "public" {
		http.Error(w, "File is not public", http.StatusForbidden)
		return
	}

	lookupID := fileID
	if file.BlobPath != nil && *file.BlobPath != "" {
		lookupID = *file.BlobPath
	}

	rc, err := h.BlobStore.Get(r.Context(), lookupID)
	if err != nil {
		http.Error(w, "Blob not found", http.StatusNotFound)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition", "attachment")
	io.Copy(w, rc)
}
