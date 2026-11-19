package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/store"
)

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

	const maxStorage = 250 * 1024 * 1024 // 250MB
	if parentFileID != "" {
		currentStorage, err := h.Store.GetFileTotalStorage(r.Context(), parentFileID)
		if err == nil {
			if file.ParentFileID != nil && *file.ParentFileID == parentFileID {
				currentStorage -= file.Size
				if currentStorage < 0 {
					currentStorage = 0
				}
			}
			incomingSize := r.ContentLength
			if incomingSize > 0 && currentStorage+incomingSize > maxStorage {
				// Check if user has storage:expand token
				token := r.Header.Get("X-Access-Token")
				if token == "" {
					token = r.Header.Get("Authorization")
				}
				if !ValidateStorageExpandToken(r.Context(), h.Store, token) {
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
		}
	}

	oldRc, blobErr := h.BlobStore.Get(r.Context(), id)
	var oldBlobBytes []byte
	if blobErr == nil {
		oldBlobBytes, _ = io.ReadAll(oldRc)
		oldRc.Close()
	}

	// Stream body to BlobStore
	if err := h.BlobStore.Put(r.Context(), id, r.Body); err != nil {
		http.Error(w, "Failed to write blob", http.StatusInternalServerError)
		return
	}

	// Server-side backup cascade: maintains the "1 week" full-copy base slot
	if len(oldBlobBytes) > 0 {
		go h.handleBackupCascade(context.Background(), id, oldBlobBytes)
	}

	// Update file blob path (if not already set, though BlobStore abstracts path)
	// We might want to mark it as "uploaded" or update size.
	// For now, just assume it's there.
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
	if r.ContentLength > 0 {
		file.Size = r.ContentLength
	}
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
		if len(file.Content) > 0 {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Write(file.Content)
			return
		}
		log.Printf("[ERROR] DownloadFile: Blob not found key=%s: %v", lookupID, err)
		http.Error(w, "Blob not found", http.StatusNotFound)
		return
	}
	defer rc.Close()

	w.Header().Set("Content-Type", "application/octet-stream")
	io.Copy(w, rc)
}

func (h *FileHandler) DownloadPublicFile(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	if fileID == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	file, err := h.Store.GetFile(r.Context(), fileID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
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
	io.Copy(w, rc)
}
