package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

type CreateExternalFolderRequest struct {
	Title     string  `json:"title"`
	ParentID  *string `json:"parent_id"`
	Color     string  `json:"color"`
	Safe      string  `json:"safe"`
	Workspace string  `json:"workspace"`
	Icon      string  `json:"icon"`
}

type UpdateExternalFolderRequest struct {
	Title     *string `json:"title"`
	ParentID  *string `json:"parent_id"`
	Color     *string `json:"color"`
	Safe      *string `json:"safe"`
	Workspace *string `json:"workspace"`
	Icon      *string `json:"icon"`
}

type externalFolderMeta struct {
	Title string `json:"title"`
	Color string `json:"color"`
	Safe  string `json:"safe"`
	Icon  string `json:"icon"`
}

func firstNonEmptyFolderStr(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func fileToExternalFolder(file *db.File) db.ExternalFolder {
	var meta, pub externalFolderMeta
	if len(file.Metadata) > 0 {
		_ = json.Unmarshal(file.Metadata, &meta)
	}
	if len(file.PublicMeta) > 0 {
		_ = json.Unmarshal(file.PublicMeta, &pub)
	}
	return db.ExternalFolder{
		ID: file.ID, Title: firstNonEmptyFolderStr(meta.Title, pub.Title), ParentID: file.ParentID,
		Color: firstNonEmptyFolderStr(meta.Color, pub.Color), Safe: normSafeName(firstNonEmptyFolderStr(meta.Safe, pub.Safe)),
		Icon: firstNonEmptyFolderStr(meta.Icon, pub.Icon), Version: file.Version,
		CreatedAt: file.CreatedAt, UpdatedAt: file.UpdatedAt,
	}
}

func safeAllowedByScope(safe string, safes []string) bool {
	if len(safes) == 0 {
		return true
	}
	norm := normSafeName(safe)
	for _, s := range safes {
		if normSafeName(s) == norm {
			return true
		}
	}
	return false
}

func (h *ExternalHandler) folderAllowedByScope(ctx context.Context, folder *db.File, userID string, folders []string) bool {
	if len(folders) == 0 {
		return true
	}
	for _, fID := range folders {
		if folder.ID == fID {
			return true
		}
	}
	return h.fileMatchesScopeForUser(ctx, folder, userID, nil, folders)
}

func (h *ExternalHandler) validateFolderParent(
	w http.ResponseWriter, ctx context.Context, userID, rawParentID string, safes, folders []string,
) (*db.File, bool) {
	parentFile, err := h.Store.GetAccessibleFile(ctx, strings.TrimSpace(rawParentID), userID)
	if err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Parent folder not found or access denied")
		return nil, false
	}
	if parentFile.Type != db.FileTypeFolder || isGroupFolder(parentFile) || isSoftDeleted(parentFile) {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Parent must be an active folder")
		return nil, false
	}
	if !store.CanWrite(parentFile.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Write permission required on parent folder")
		return nil, false
	}
	if !h.folderAllowedByScope(ctx, parentFile, userID, folders) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Parent folder does not match scoped token folder")
		return nil, false
	}
	if !safeAllowedByScope(h.getFileSafe(ctx, parentFile), safes) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Parent folder safe does not match scoped token workspace")
		return nil, false
	}
	return parentFile, true
}

func (h *ExternalHandler) broadcastExternalFileEvent(file *db.File, payload map[string]interface{}) {
	if msgBytes, err := json.Marshal(payload); err == nil {
		h.broadcastToFileUsers(file.ID, file.OwnerID, string(msgBytes))
	} else {
		log.Printf("external_folders: failed to marshal SSE payload for %s: %v", file.ID, err)
	}
}

func requireExternalUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	return userID, true
}

func (h *ExternalHandler) loadScopedFolder(w http.ResponseWriter, r *http.Request, requireWrite bool) (*db.File, string, []string, []string, bool) {
	userID, ok := requireExternalUser(w, r)
	if !ok {
		return nil, "", nil, nil, false
	}
	folderID := chi.URLParam(r, "id")
	if folderID == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Missing folder ID")
		return nil, "", nil, nil, false
	}
	file, err := h.Store.GetAccessibleFile(r.Context(), folderID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeExternalError(w, http.StatusNotFound, "Not Found", "Folder not found")
		} else {
			writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve folder")
		}
		return nil, "", nil, nil, false
	}
	if file.Type != db.FileTypeFolder || isGroupFolder(file) || isSoftDeleted(file) {
		writeExternalError(w, http.StatusNotFound, "Not Found", "Folder not found")
		return nil, "", nil, nil, false
	}
	if requireWrite && !store.CanWrite(file.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Write permission required")
		return nil, "", nil, nil, false
	}
	safes, folders := extractScopes(r)
	if !h.fileMatchesScopeForUser(r.Context(), file, userID, safes, folders) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Folder does not belong to scoped workspace or folder")
		return nil, "", nil, nil, false
	}
	return file, userID, safes, folders, true
}

func (h *ExternalHandler) ListFolders(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireExternalUser(w, r)
	if !ok {
		return
	}
	safes, folders := extractScopes(r)
	q := r.URL.Query()
	search := firstNonEmptyFolderStr(q.Get("search"), q.Get("q"))
	parentFilter := strings.TrimSpace(q.Get("parent_id"))
	safeFilter := strings.TrimSpace(firstNonEmptyFolderStr(q.Get("safe"), q.Get("workspace")))
	limit := 100
	if limitStr := strings.TrimSpace(q.Get("limit")); limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err != nil || parsedLimit <= 0 {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'limit' query parameter")
			return
		}
		limit = min(parsedLimit, 500)
	}
	rows, err := h.Store.ListFoldersForExternalAPI(r.Context(), userID, false, false, search, 0)
	if err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve folders")
		return
	}
	items := make([]db.ExternalFolder, 0)
	for _, f := range rows {
		if !h.fileMatchesScopeForUser(r.Context(), f, userID, safes, folders) {
			continue
		}
		if parentFilter == "root" || parentFilter == "null" {
			if f.ParentID != nil && *f.ParentID != "" {
				continue
			}
		} else if parentFilter != "" && (f.ParentID == nil || *f.ParentID != parentFilter) {
			continue
		}
		item := fileToExternalFolder(f)
		if safeFilter != "" && item.Safe != normSafeName(safeFilter) {
			continue
		}
		items = append(items, item)
		if len(items) >= limit {
			break
		}
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"count": len(items), "folders": items})
}

func (h *ExternalHandler) GetFolder(w http.ResponseWriter, r *http.Request) {
	file, _, _, _, ok := h.loadScopedFolder(w, r, false)
	if !ok {
		return
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"folder": fileToExternalFolder(file)})
}

func (h *ExternalHandler) CreateFolder(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireExternalUser(w, r)
	if !ok {
		return
	}
	safes, folders := extractScopes(r)
	var req CreateExternalFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid request body")
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Folder title is required")
		return
	}
	var parentID *string
	var parentFile *db.File
	rawParent := ""
	if req.ParentID != nil {
		rawParent = strings.TrimSpace(*req.ParentID)
	}
	if rawParent == "" && len(folders) > 0 {
		rawParent = folders[0]
	}
	if rawParent != "" {
		pf, ok := h.validateFolderParent(w, r.Context(), userID, rawParent, safes, folders)
		if !ok {
			return
		}
		parentFile, parentID = pf, &pf.ID
	}
	resolvedSafe := "main"
	if explicitSafe := strings.TrimSpace(firstNonEmptyFolderStr(req.Safe, req.Workspace)); explicitSafe != "" {
		resolvedSafe = normSafeName(explicitSafe)
	} else if parentFile != nil {
		resolvedSafe = h.getFileSafe(r.Context(), parentFile)
	} else if len(safes) > 0 {
		resolvedSafe = normSafeName(safes[0])
	}
	if !safeAllowedByScope(resolvedSafe, safes) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Workspace does not match scoped token workspace")
		return
	}
	metaBytes, _ := json.Marshal(map[string]interface{}{
		"title": title, "color": strings.TrimSpace(req.Color), "safe": resolvedSafe,
		"icon": strings.TrimSpace(req.Icon), "unencrypted": true, "author": "external_api",
	})
	now := time.Now().UTC()
	file := &db.File{
		ID: uuid.New().String(), OwnerID: userID, ParentID: parentID, Type: db.FileTypeFolder,
		CreatedAt: now, UpdatedAt: now, Visibility: "private",
		PublicMeta: json.RawMessage("{}"), Metadata: metaBytes, Version: 2,
	}
	if err := h.Store.CreateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to create folder")
		return
	}
	h.broadcastExternalFileEvent(file, map[string]interface{}{"type": "file_created", "file_id": file.ID, "source": "external_api"})
	writeExternalJSON(w, http.StatusCreated, map[string]interface{}{"folder": fileToExternalFolder(file)})
}

func (h *ExternalHandler) UpdateFolder(w http.ResponseWriter, r *http.Request) {
	file, userID, safes, folders, ok := h.loadScopedFolder(w, r, true)
	if !ok {
		return
	}
	var req UpdateExternalFolderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid request body")
		return
	}
	if req.ParentID != nil {
		rawParent := strings.TrimSpace(*req.ParentID)
		if rawParent == "" || rawParent == "__none__" {
			if len(folders) > 0 {
				writeExternalError(w, http.StatusForbidden, "Forbidden", "Cannot move folder to root with folder-scoped token")
				return
			}
			file.ParentID = nil
		} else if rawParent == file.ID {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Folder cannot be its own parent")
			return
		} else {
			parentFile, ok := h.validateFolderParent(w, r.Context(), userID, rawParent, safes, folders)
			if !ok {
				return
			}
			for depth, curr := 0, parentFile.ParentID; depth < 50 && curr != nil && *curr != ""; depth++ {
				if *curr == file.ID {
					writeExternalError(w, http.StatusBadRequest, "Bad Request", "Cannot move folder into one of its descendants")
					return
				}
				anc, err := h.Store.GetAccessibleFile(r.Context(), *curr, userID)
				if err != nil {
					break
				}
				curr = anc.ParentID
			}
			file.ParentID = &parentFile.ID
		}
	}
	metaMap := make(map[string]interface{})
	if len(file.PublicMeta) > 0 {
		_ = json.Unmarshal(file.PublicMeta, &metaMap)
	}
	if len(file.Metadata) > 0 {
		_ = json.Unmarshal(file.Metadata, &metaMap)
	}
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Folder title cannot be empty")
			return
		}
		metaMap["title"], file.SecuredMeta = title, nil
	}
	if req.Color != nil {
		metaMap["color"] = strings.TrimSpace(*req.Color)
	}
	if req.Icon != nil {
		metaMap["icon"] = strings.TrimSpace(*req.Icon)
	}
	if req.Safe != nil || req.Workspace != nil {
		safeVal := req.Safe
		if safeVal == nil {
			safeVal = req.Workspace
		}
		newSafe := normSafeName(*safeVal)
		if !safeAllowedByScope(newSafe, safes) {
			writeExternalError(w, http.StatusForbidden, "Forbidden", "Workspace does not match scoped token workspace")
			return
		}
		metaMap["safe"] = newSafe
	}
	file.Metadata, _ = json.Marshal(metaMap)
	file.Version = max(file.Version+1, 2)
	file.UpdatedAt = time.Now().UTC()
	if err := h.Store.UpdateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to update folder")
		return
	}
	folder := fileToExternalFolder(file)
	h.broadcastExternalFileEvent(file, map[string]interface{}{
		"type": "file_updated", "file_id": file.ID, "source": "external_api",
		"title": folder.Title, "metadata": json.RawMessage(file.Metadata),
	})
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"folder": folder})
}

func (h *ExternalHandler) DeleteFolder(w http.ResponseWriter, r *http.Request) {
	file, userID, _, _, ok := h.loadScopedFolder(w, r, false)
	if !ok {
		return
	}
	if file.OwnerID != userID && !store.CanAdmin(file.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Only the folder owner or admin can delete this folder")
		return
	}
	if r.URL.Query().Get("permanent") == "true" {
		blobPaths, err := h.Store.GetFileBlobPaths(r.Context(), file.ID)
		if err != nil {
			log.Printf("DeleteFolder: failed to fetch blob paths for folder %s: %v", file.ID, err)
		}
		if err := h.Store.DeleteFile(r.Context(), file.ID); err != nil {
			writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete folder")
			return
		}
		if h.BlobStore != nil {
			if file.BlobPath != nil && *file.BlobPath != "" {
				blobPaths = append(blobPaths, *file.BlobPath)
			}
			seen := make(map[string]struct{}, len(blobPaths))
			for _, bp := range blobPaths {
				if _, dup := seen[bp]; bp == "" || dup {
					continue
				}
				seen[bp] = struct{}{}
				if refs, err := h.Store.CountBlobReferencesExcluding(r.Context(), bp, []string{file.ID}); err == nil && refs == 0 {
					if err := h.BlobStore.Delete(r.Context(), bp); err != nil {
						log.Printf("DeleteFolder: failed to delete blob %s: %v", bp, err)
					}
				}
			}
		}
	} else if err := h.Store.SoftDeleteFile(r.Context(), file.ID); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete folder")
		return
	}
	h.broadcastExternalFileEvent(file, map[string]interface{}{"type": "file_deleted", "file_id": file.ID, "source": "external_api"})
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Folder deleted successfully", "id": file.ID})
}
