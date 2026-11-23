package api

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

func marshalFileDeletedEvent(fileID string) (string, error) {
	payload, err := json.Marshal(struct {
		Type   string `json:"type"`
		FileID string `json:"file_id"`
	}{
		Type:   "file_deleted",
		FileID: fileID,
	})
	if err != nil {
		return "", err
	}
	return string(payload), nil
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
		log.Printf("DeleteFile: failed to get file %s: %v", id, err)
		http.Error(w, "Failed to get file", http.StatusInternalServerError)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	permanent := r.URL.Query().Get("permanent") == "true"

	if file.OwnerID == userID {
		if permanent {
			// Owner: Permanent Delete File
			blobPaths, _ := h.Store.GetFileBlobPaths(r.Context(), id)
			if err := h.Store.DeleteFile(r.Context(), id); err != nil {
				log.Printf("DeleteFile: failed to permanently delete file %s: %v", id, err)
				http.Error(w, "Failed to delete file permanently", http.StatusInternalServerError)
				return
			}
			for _, blobPath := range blobPaths {
				refs, err := h.Store.CountBlobReferencesExcluding(r.Context(), blobPath, []string{id})
				if err == nil && refs == 0 && h.BlobStore != nil {
					_ = h.BlobStore.Delete(r.Context(), blobPath)
				}
			}
			if file.BlobPath != nil && *file.BlobPath != "" {
				refs, err := h.Store.CountBlobReferencesExcluding(r.Context(), *file.BlobPath, []string{id})
				if err == nil && refs == 0 && h.BlobStore != nil {
					_ = h.BlobStore.Delete(r.Context(), *file.BlobPath)
				}
			}
		} else {
			// Owner: Soft Delete File
			if err := h.Store.SoftDeleteFile(r.Context(), id); err != nil {
				log.Printf("DeleteFile: failed to soft delete file %s: %v", id, err)
				http.Error(w, "Failed to soft delete file", http.StatusInternalServerError)
				return
			}
		}
		if eventPayload, err := marshalFileDeletedEvent(id); err == nil {
			h.broadcastToFileUsers(id, file.OwnerID, eventPayload)
		} else {
			log.Printf("DeleteFile: failed to marshal SSE payload for %s: %v", id, err)
		}
	} else {
		// Check if user is an editor on parent note/folder deleting a child file/asset
		canDeleteChild := false
		if file.ParentID != nil && *file.ParentID != "" {
			if parentFile, err := h.Store.GetAccessibleFile(r.Context(), *file.ParentID, userID); err == nil && store.CanWrite(parentFile.Permission) {
				canDeleteChild = true
			}
		}

		if canDeleteChild {
			if permanent {
				// Permanent deletion is strictly restricted to the file owner.
				http.Error(w, "Forbidden: only the owner can permanently delete a file", http.StatusForbidden)
				return
			}
			if err := h.Store.SoftDeleteFile(r.Context(), id); err != nil {
				log.Printf("DeleteFile: failed to soft delete child file %s: %v", id, err)
				http.Error(w, "Failed to soft delete file", http.StatusInternalServerError)
				return
			}
			if eventPayload, err := marshalFileDeletedEvent(id); err == nil {
				h.broadcastToFileUsers(id, file.OwnerID, eventPayload)
			} else {
				log.Printf("DeleteFile: failed to marshal SSE payload for %s: %v", id, err)
			}
		} else {
			// Not Owner (Collaborator): Remove Share (leave shared file)
			if err := h.Store.RemoveShare(r.Context(), id, userID); err != nil {
				if err == store.ErrNotFound {
					http.Error(w, "Share not found", http.StatusNotFound)
					return
				}
				log.Printf("DeleteFile: failed to remove share for file %s user %s: %v", id, userID, err)
				http.Error(w, "Failed to remove share", http.StatusInternalServerError)
				return
			}
		}
	}

	w.WriteHeader(http.StatusNoContent)
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
		log.Printf("CopyFile: failed to retrieve file %s: %v", fileID, err)
		http.Error(w, "Failed to retrieve file", http.StatusInternalServerError)
		return
	}

	if req.TargetParentID != nil && *req.TargetParentID != "" {
		parent, err := h.Store.GetAccessibleFile(r.Context(), *req.TargetParentID, viewerID)
		if err != nil {
			if err == store.ErrNotFound {
				http.Error(w, "Forbidden: no write access to target folder", http.StatusForbidden)
				return
			}
			log.Printf("CopyFile: failed to check target folder %s: %v", *req.TargetParentID, err)
			http.Error(w, "Failed to verify target folder", http.StatusInternalServerError)
			return
		}
		if !store.CanWrite(parent.Permission) {
			http.Error(w, "Forbidden: no write access to target folder", http.StatusForbidden)
			return
		}
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
		log.Printf("CopyFile: failed to create copied file for user %s: %v", viewerID, err)
		http.Error(w, "Failed to copy file", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(newFile); err != nil {
		log.Printf("CopyFile: failed to encode response for file %s: %v", newFile.ID, err)
	}
}
