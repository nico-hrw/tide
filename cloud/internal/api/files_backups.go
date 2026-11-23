package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

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
	if backups == nil {
		backups = []db.FileBackup{}
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
	if unescaped, err := url.PathUnescape(slotName); err == nil {
		slotName = unescaped
	}
	slotName = strings.TrimSpace(slotName)

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
		if err == store.ErrNotFound {
			http.Error(w, "Backup not found", http.StatusNotFound)
			return
		}
		http.Error(w, "Failed to get backup", http.StatusInternalServerError)
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
		slotMap[strings.TrimSpace(backups[i].SlotName)] = &backups[i]
	}

	// Only the "1 week" base slot is maintained server-side (full copy).
	// Shorter slots (10min–2d) are handled client-side as delta patches.
	slots := []struct {
		name string
		dur  time.Duration
	}{
		{"1 week", 7 * 24 * time.Hour},
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

var validBackupSlots = map[string]bool{
	"10 minutes": true,
	"30 minutes": true,
	"1 hour":     true,
	"1 day":      true,
	"2 days":     true,
	"1 week":     true,
}

func (h *FileHandler) UpdateFileBackup(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "fileID")
	slotName := chi.URLParam(r, "slotName")
	if unescaped, err := url.PathUnescape(slotName); err == nil {
		slotName = unescaped
	}
	slotName = strings.TrimSpace(slotName)
	if id == "" || slotName == "" {
		http.Error(w, "Missing arguments", http.StatusBadRequest)
		return
	}
	if !validBackupSlots[slotName] {
		http.Error(w, "Invalid backup slot name", http.StatusBadRequest)
		return
	}

	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	file, err := h.Store.GetAccessibleFile(r.Context(), id, userID)
	if err != nil {
		http.Error(w, "File not found or access denied", http.StatusNotFound)
		return
	}

	if !store.CanWrite(file.Permission) {
		http.Error(w, "Forbidden: write permission required", http.StatusForbidden)
		return
	}

	var req struct {
		EncryptedBlob string                 `json:"encrypted_blob"`
		SecuredMeta   []byte                 `json:"secured_meta"`
		AccessKeys    map[string]interface{} `json:"access_keys"`
		Version       int                    `json:"version"`
		UpdatedAt     string                 `json:"updated_at,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	blobBytes := decodeBase64OrRaw(req.EncryptedBlob)
	if len(blobBytes) == 0 {
		http.Error(w, "Missing encrypted_blob", http.StatusBadRequest)
		return
	}

	var accessKeysBytes []byte
	if req.AccessKeys != nil {
		accessKeysBytes, _ = json.Marshal(req.AccessKeys)
	}

	version := req.Version
	if version <= 0 {
		version = file.Version
		if version <= 0 {
			version = 1
		}
	}

	now := time.Now().UTC()
	updatedAt := now
	if strings.TrimSpace(req.UpdatedAt) != "" {
		if parsed, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(req.UpdatedAt)); err == nil {
			parsedUTC := parsed.UTC()
			if !parsedUTC.After(now) {
				updatedAt = parsedUTC
			}
		}
	}

	newB := &db.FileBackup{
		ID:            uuid.New().String(),
		FileID:        id,
		SlotName:      slotName,
		EncryptedBlob: blobBytes,
		SecuredMeta:   req.SecuredMeta,
		AccessKeys:    json.RawMessage(accessKeysBytes),
		Version:       version,
		UpdatedAt:     updatedAt,
	}

	if len(newB.SecuredMeta) == 0 {
		newB.SecuredMeta = file.SecuredMeta
	}
	if len(newB.AccessKeys) == 0 || string(newB.AccessKeys) == "{}" {
		newB.AccessKeys = file.AccessKeys
	}

	if err := h.Store.UpsertFileBackup(r.Context(), newB); err != nil {
		http.Error(w, "Failed to upsert backup", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *FileHandler) RestoreFile(w http.ResponseWriter, r *http.Request) {
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

	file, err := h.Store.GetAccessibleFile(r.Context(), id, userID)
	if err != nil {
		http.Error(w, "File not found or access denied", http.StatusNotFound)
		return
	}

	if !store.CanAdmin(file.Permission) {
		http.Error(w, "Forbidden: only the owner can restore files", http.StatusForbidden)
		return
	}

	if err := h.Store.RestoreFile(r.Context(), id); err != nil {
		http.Error(w, "Failed to restore file", http.StatusInternalServerError)
		return
	}

	h.broadcastToFileUsers(id, file.OwnerID, fmt.Sprintf(`{"type":"file_created","file_id":"%s"}`, id))

	w.WriteHeader(http.StatusNoContent)
}
