package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

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
	RecipientID    string `json:"recipient_id"`
	RecipientEmail string `json:"email"`
	SecuredMeta    string `json:"secured_meta"` // RSA-encrypted title for file_shares
	WrappedDEK     string `json:"wrapped_dek"`  // Wrapped DEK for access_keys (V2)
	Permission     string `json:"permission"`   // 'view' | 'edit' | 'share' (defaults to 'view')
	CanReshare     bool   `json:"can_reshare"`
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

	permission := req.Permission
	if permission == "" {
		permission = "view"
	}
	if permission != "view" && permission != "edit" && permission != "share" {
		http.Error(w, "Invalid permission", http.StatusBadRequest)
		return
	}

	file, err := h.Store.GetFile(r.Context(), fileID)
	if err != nil {
		if err == store.ErrNotFound {
			log.Printf("[ERROR] ShareFile: file not found: %s", fileID)
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}
		log.Printf("[ERROR] ShareFile: failed to retrieve file %s: %v", fileID, err)
		http.Error(w, "Failed to retrieve file", http.StatusInternalServerError)
		return
	}
	var canReshare bool
	if file.OwnerID == userID {
		canReshare = req.CanReshare
	} else {
		callerShare, err := h.Store.GetShare(r.Context(), fileID, userID)
		if err != nil || callerShare == nil || callerShare.Status != "accepted" || !callerShare.CanReshare {
			http.Error(w, "Forbidden: re-sharing is not permitted for this note", http.StatusForbidden)
			return
		}

		if callerShare.Permission == "view" && permission != "view" {
			http.Error(w, "Forbidden: cannot grant higher permission than view", http.StatusForbidden)
			return
		}
		if callerShare.Permission == "edit" && permission == "share" {
			http.Error(w, "Forbidden: cannot grant higher permission than edit", http.StatusForbidden)
			return
		}

		canReshare = false
	}

	// 1. Resolve Recipient ID
	var recipient *db.User
	if req.RecipientID != "" {
		recipient, err = h.Store.GetUser(r.Context(), req.RecipientID)
	} else if req.RecipientEmail != "" && req.RecipientEmail != "Hidden" {
		emailHash := hashString(req.RecipientEmail)
		recipient, err = h.Store.GetUserByEmailHash(r.Context(), emailHash)
	} else {
		http.Error(w, "Recipient identification (email or ID) required", http.StatusBadRequest)
		return
	}

	if err != nil || recipient == nil {
		log.Printf("[ERROR] ShareFile: recipient not found (ID: %s): %v", req.RecipientID, err)
		http.Error(w, "Recipient not found", http.StatusNotFound)
		return
	}

	if file.OwnerID != userID {
		if recipient.ID == file.OwnerID {
			http.Error(w, "Forbidden: cannot alter owner's access", http.StatusForbidden)
			return
		}
		existingShare, err := h.Store.GetShare(r.Context(), fileID, recipient.ID)
		if err != nil && err != store.ErrNotFound {
			log.Printf("[ERROR] ShareFile: failed to check existing share for file %s recipient %s: %v", fileID, recipient.ID, err)
			http.Error(w, "Failed to verify existing share", http.StatusInternalServerError)
			return
		}
		if existingShare != nil {
			http.Error(w, "Conflict: recipient already has a share on this file", http.StatusConflict)
			return
		}
	}

	// 2. Insert into file_shares with the requested permission level (default: view).
	if err := h.Store.ShareFileWithPermission(r.Context(), fileID, recipient.ID, decodeBase64OrRaw(req.SecuredMeta), permission, canReshare); err != nil {
		http.Error(w, "Failed to share file", http.StatusInternalServerError)
		return
	}

	// 3. [V2-FIX / COLLAB-FIX] Atomically update the file's access_keys map so
	//    the recipient can unwrap the DEK. Use `wrapped_dek` if provided (new clients),
	//    fall back to `secured_meta` for backward compatibility (old clients that sent
	//    the wrapped DEK as secured_meta).
	dekToStore := req.WrappedDEK
	if dekToStore == "" {
		dekToStore = req.SecuredMeta // backward compat
	}
	if dekToStore != "" {
		wrappedKeyJSON, _ := json.Marshal(map[string]string{"wrapped_key": dekToStore})
		if err := h.Store.UpdateFileAccessKey(r.Context(), fileID, recipient.ID, string(wrappedKeyJSON)); err != nil {
			log.Printf("[SHARE] Warning: atomic access_keys update failed for file %s: %v", fileID, err)
		}
	}

	// Broadcast to the recipient so their UI fetches it instantly
	if eventData, err := json.Marshal(map[string]string{"type": "file_shared", "file_id": fileID}); err == nil {
		go h.Broker.Broadcast(recipient.ID, string(eventData))
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Shared successfully"}`))
}

// ListShares returns all shares of a file. Owner-only.
func (h *FileHandler) ListShares(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	file, err := h.Store.GetFile(r.Context(), fileID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	if file.OwnerID != userID {
		http.Error(w, "Forbidden: only the owner can list shares", http.StatusForbidden)
		return
	}
	shares, err := h.Store.ListSharesForFile(r.Context(), fileID)
	if err != nil {
		http.Error(w, "Failed to list shares", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(shares)
}

type UpdatePermissionRequest struct {
	Permission string `json:"permission"`
}

// UpdateSharePermissionEndpoint changes a recipient's permission level. Owner-only.
func (h *FileHandler) UpdateSharePermissionEndpoint(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	targetUserID := chi.URLParam(r, "userID")
	requesterID, ok := r.Context().Value("user_id").(string)
	if !ok || requesterID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	file, err := h.Store.GetFile(r.Context(), fileID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	if file.OwnerID != requesterID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var req UpdatePermissionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}
	if err := h.Store.UpdateSharePermission(r.Context(), fileID, targetUserID, req.Permission); err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Share not found", http.StatusNotFound)
			return
		}
		log.Printf("[ERROR] UpdateSharePermission: failed for file %s user %s: %v", fileID, targetUserID, err)
		http.Error(w, "Invalid permission or failed to update share", http.StatusBadRequest)
		return
	}

	// [FIX] Notify the target user so their frontend immediately updates permissions
	if eventData, err := json.Marshal(map[string]string{"type": "file_updated", "file_id": fileID}); err == nil {
		h.Broker.Broadcast(targetUserID, string(eventData))
	}

	if h.Hub != nil {
		h.Hub.EnforcePermissionChange(fileID, targetUserID, req.Permission)
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Permission updated"}`))
}

// RevokeShare removes a recipient's access to a file. Owner-only.
func (h *FileHandler) RevokeShare(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	targetUserID := chi.URLParam(r, "userID")
	requesterID, ok := r.Context().Value("user_id").(string)
	if !ok || requesterID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	file, err := h.Store.GetFile(r.Context(), fileID)
	if err != nil {
		http.Error(w, "File not found", http.StatusNotFound)
		return
	}
	if file.OwnerID != requesterID {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if err := h.Store.RemoveShare(r.Context(), fileID, targetUserID); err != nil {
		if err == store.ErrNotFound {
			http.Error(w, "Share not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to revoke share", http.StatusInternalServerError)
		return
	}

	// [FIX] Notify the target user so their frontend immediately locks the editor
	if eventData, err := json.Marshal(map[string]string{"type": "file_updated", "file_id": fileID}); err == nil {
		h.Broker.Broadcast(targetUserID, string(eventData))
	}

	// Also remove the recipient's wrapped DEK from access_keys.
	_ = h.Store.RemoveFileAccessKey(r.Context(), fileID, targetUserID)

	if h.Hub != nil {
		h.Hub.EnforcePermissionChange(fileID, targetUserID, "revoked")
	}

	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"message": "Share revoked"}`))
}

type VisibilityRequest struct {
	FileID     string `json:"file_id"`
	Visibility string `json:"visibility"` // 'private', 'public', or 'contacts'
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

	if req.Visibility != "private" && req.Visibility != "public" && req.Visibility != "contacts" {
		http.Error(w, "Invalid visibility", http.StatusBadRequest)
		return
	}

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

type RevokeAndRotateRequest struct {
	TargetUserID   string          `json:"targetUserId"`
	NewKeyEpoch    uint32          `json:"newKeyEpoch"`
	NewAccessKeys  json.RawMessage `json:"newAccessKeys"`
	NewSecuredMeta string          `json:"newSecuredMeta"`
	Snapshot       struct {
		IVBase64         string `json:"ivBase64"`
		CiphertextBase64 string `json:"ciphertextBase64"`
	} `json:"snapshot"`
}

func (h *FileHandler) RevokeAndRotate(w http.ResponseWriter, r *http.Request) {
	fileID := chi.URLParam(r, "fileID")
	if fileID == "" {
		http.Error(w, "Missing file ID", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	file, err := h.Store.GetAccessibleFile(r.Context(), fileID, userID)
	if err != nil {
		http.Error(w, "File not found or access denied", http.StatusNotFound)
		return
	}

	if !store.CanAdmin(file.Permission) {
		http.Error(w, "Forbidden: admin permission required", http.StatusForbidden)
		return
	}

	var req RevokeAndRotateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("[ERROR] RevokeAndRotate: invalid request body for file %s: %v", fileID, err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.TargetUserID == "" {
		http.Error(w, "Missing targetUserId", http.StatusBadRequest)
		return
	}

	iv, err := base64.StdEncoding.DecodeString(req.Snapshot.IVBase64)
	if err != nil {
		http.Error(w, "Invalid snapshot ivBase64 encoding", http.StatusBadRequest)
		return
	}

	ciphertext, err := base64.StdEncoding.DecodeString(req.Snapshot.CiphertextBase64)
	if err != nil {
		http.Error(w, "Invalid snapshot ciphertextBase64 encoding", http.StatusBadRequest)
		return
	}

	if err := h.Store.RevokeShareAndRotateKey(r.Context(), fileID, req.TargetUserID, req.NewKeyEpoch, string(req.NewAccessKeys), req.NewSecuredMeta, iv, ciphertext); err != nil {
		log.Printf("[ERROR] RevokeAndRotate: failed for file %s: %v", fileID, err)
		http.Error(w, "Failed to revoke share and rotate key", http.StatusInternalServerError)
		return
	}

	if h.Hub != nil {
		h.Hub.EnforcePermissionChange(fileID, req.TargetUserID, "revoked")
		h.Hub.BroadcastKeyRotation(fileID, req.NewKeyEpoch)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}
