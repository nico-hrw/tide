package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

// --- Notes API ---

type CreateExternalNoteRequest struct {
	Title       string   `json:"title"`
	Content     string   `json:"content"`
	ParentID    *string  `json:"parent_id"`
	Safe        string   `json:"safe"`
	Workspace   string   `json:"workspace"`
	LinkedSafes []string `json:"linked_safes"`
	TagIDs      []string `json:"tag_ids"`
	Icon        string   `json:"icon"`
	Color       string   `json:"color"`
}

type UpdateExternalNoteRequest struct {
	Title         *string   `json:"title"`
	Content       *string   `json:"content"`
	AppendContent *string   `json:"append_content"`
	ParentID      *string   `json:"parent_id"`
	Safe          *string   `json:"safe"`
	Workspace     *string   `json:"workspace"`
	LinkedSafes   *[]string `json:"linked_safes"`
	TagIDs        *[]string `json:"tag_ids"`
	Icon          *string   `json:"icon"`
	Color         *string   `json:"color"`
}

func (h *ExternalHandler) ListNotes(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	safes, folders := extractScopes(r)
	q := r.URL.Query()
	search := q.Get("search")
	if search == "" {
		search = q.Get("q")
	}

	limit := 100
	if limitStr := q.Get("limit"); limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err != nil || parsedLimit <= 0 {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'limit' parameter: must be a positive integer")
			return
		}
		if parsedLimit > 500 {
			limit = 500
		} else {
			limit = parsedLimit
		}
	}

	parentFilter := strings.TrimSpace(q.Get("parent_id"))
	safeFilter := strings.TrimSpace(q.Get("safe"))
	if safeFilter == "" {
		safeFilter = strings.TrimSpace(q.Get("workspace"))
	}
	tagFilter := strings.TrimSpace(q.Get("tag_id"))

	notes, err := h.Store.ListNotesForExternalAPI(r.Context(), userID, search, 0)
	if err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve notes")
		return
	}

	filtered := make([]*db.ExternalNoteListItem, 0, len(notes))
	for _, n := range notes {
		if parentFilter != "" {
			isRoot := strings.EqualFold(parentFilter, "root") || strings.EqualFold(parentFilter, "null")
			if (isRoot && n.ParentID != nil && *n.ParentID != "") || (!isRoot && (n.ParentID == nil || *n.ParentID != parentFilter)) {
				continue
			}
		}
		if safeFilter != "" && normSafeName(n.Safe) != normSafeName(safeFilter) {
			continue
		}
		if tagFilter != "" && !stringInSlice(tagFilter, n.TagIDs) {
			continue
		}
		if len(folders) > 0 || (len(safes) > 0 && n.Safe == "") {
			f, err := h.Store.GetAccessibleFile(r.Context(), n.ID, userID)
			if err != nil || !h.fileMatchesScopeForUser(r.Context(), f, userID, safes, folders) {
				continue
			}
		} else if len(safes) > 0 && !safeInList(n.Safe, safes) {
			continue
		}
		filtered = append(filtered, n)
	}

	if limit > 0 && len(filtered) > limit {
		filtered = filtered[:limit]
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"count": len(filtered), "notes": filtered})
}

func (h *ExternalHandler) getNoteContent(ctx context.Context, file *db.File) string {
	contentStr := ""
	blobKey := file.ID
	if file.BlobPath != nil && *file.BlobPath != "" {
		blobKey = *file.BlobPath
	}
	if h.BlobStore != nil {
		if rc, err := h.BlobStore.Get(ctx, blobKey); err == nil {
			b, errRead := io.ReadAll(rc)
			rc.Close()
			if errRead == nil && len(b) > 0 {
				contentStr = string(b)
			}
		}
	}
	// Fallback to file.Content ONLY if BlobStore did not yield content and file.Content is valid UTF-8 text (not binary Yjs snapshot)
	if contentStr == "" && len(file.Content) > 0 && utf8.Valid(file.Content) && !bytes.ContainsRune(file.Content, 0) {
		contentStr = string(file.Content)
	}
	return contentStr
}

func (h *ExternalHandler) loadScopedNote(w http.ResponseWriter, r *http.Request, requireWrite bool) (*db.File, string, []string, []string, bool) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return nil, "", nil, nil, false
	}
	noteID := chi.URLParam(r, "id")
	if noteID == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Missing note ID")
		return nil, "", nil, nil, false
	}
	file, err := h.Store.GetAccessibleFile(r.Context(), noteID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeExternalError(w, http.StatusNotFound, "Not Found", "Note not found")
			return nil, "", nil, nil, false
		}
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve note")
		return nil, "", nil, nil, false
	}
	if file.Type != db.FileTypeNote || isSoftDeleted(file) {
		writeExternalError(w, http.StatusNotFound, "Not Found", "Note not found")
		return nil, "", nil, nil, false
	}
	if requireWrite && !store.CanWrite(file.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Write permission required")
		return nil, "", nil, nil, false
	}
	safes, folders := extractScopes(r)
	if !h.fileMatchesScopeForUser(r.Context(), file, userID, safes, folders) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Note does not belong to scoped workspace or folder")
		return nil, "", nil, nil, false
	}
	return file, userID, safes, folders, true
}

func (h *ExternalHandler) validateNoteParent(
	w http.ResponseWriter, ctx context.Context, userID, rawParentID, selfID string,
	safes, folders []string, folderMismatchMsg, safeMismatchMsg string,
) (*string, *db.File, bool) {
	cleanParentID := strings.TrimSpace(rawParentID)
	if selfID != "" && cleanParentID == selfID {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Note cannot be its own parent")
		return nil, nil, false
	}
	parentFile, err := h.Store.GetAccessibleFile(ctx, cleanParentID, userID)
	if err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Parent not found or access denied")
		return nil, nil, false
	}
	if parentFile.Type != db.FileTypeFolder || isGroupFolder(parentFile) || isSoftDeleted(parentFile) {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Parent must be a valid non-deleted folder")
		return nil, nil, false
	}
	if !store.CanWrite(parentFile.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Write permission required on parent")
		return nil, nil, false
	}

	visited := make(map[string]bool)
	matchesFolder := len(folders) == 0
	currID, currFile := cleanParentID, parentFile
	for depth := 0; depth < 50; depth++ {
		if selfID != "" && currID == selfID {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Parent folder would create a cycle")
			return nil, nil, false
		}
		if visited[currID] {
			break
		}
		visited[currID] = true
		if !matchesFolder && stringInSlice(currID, folders) {
			matchesFolder = true
		}
		if matchesFolder && selfID == "" {
			break
		}
		if currFile.ParentID == nil || strings.TrimSpace(*currFile.ParentID) == "" {
			break
		}
		nextID := strings.TrimSpace(*currFile.ParentID)
		nextFile, err := h.Store.GetAccessibleFile(ctx, nextID, userID)
		if err != nil {
			break
		}
		currID, currFile = nextID, nextFile
	}
	if !matchesFolder {
		writeExternalError(w, http.StatusForbidden, "Forbidden", folderMismatchMsg)
		return nil, nil, false
	}
	if len(safes) > 0 && !safeInList(h.getFileSafe(ctx, parentFile), safes) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", safeMismatchMsg)
		return nil, nil, false
	}
	return &cleanParentID, parentFile, true
}

func stringInSlice(target string, list []string) bool {
	for _, s := range list {
		if s == target {
			return true
		}
	}
	return false
}

func safeInList(safe string, safes []string) bool {
	norm := normSafeName(safe)
	for _, s := range safes {
		if normSafeName(s) == norm {
			return true
		}
	}
	return false
}

func setOptionalMetaStr(m map[string]interface{}, key string, ptr *string) bool {
	if ptr == nil {
		return false
	}
	if v := strings.TrimSpace(*ptr); v == "" {
		delete(m, key)
	} else {
		m[key] = v
	}
	return true
}

func setOptionalMetaSlice(m map[string]interface{}, key string, ptr *[]string) bool {
	if ptr == nil {
		return false
	}
	if len(*ptr) == 0 {
		delete(m, key)
	} else {
		m[key] = *ptr
	}
	return true
}

func extractMetaString(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}

func extractMetaStringSlice(m map[string]interface{}, key string) []string {
	v, ok := m[key]
	if !ok || v == nil {
		return nil
	}
	switch s := v.(type) {
	case []string:
		return s
	case []interface{}:
		out := make([]string, 0, len(s))
		for _, item := range s {
			if str, ok := item.(string); ok && str != "" {
				out = append(out, str)
			}
		}
		return out
	}
	return nil
}

func parseNoteMeta(file *db.File) (map[string]interface{}, bool) {
	var metaMap map[string]interface{}
	if len(file.Metadata) > 0 {
		_ = json.Unmarshal(file.Metadata, &metaMap)
	}
	if metaMap == nil {
		metaMap = make(map[string]interface{})
	}
	isUnencrypted := file.Visibility == "public"
	if unenc, ok := metaMap["unencrypted"].(bool); ok && unenc {
		isUnencrypted = true
	}
	return metaMap, isUnencrypted
}

func extractNoteTitle(file *db.File, metaMap map[string]interface{}) string {
	if t, ok := metaMap["title"].(string); ok && t != "" {
		return t
	}
	return store.ParseNoteTitle(string(file.Metadata), string(file.PublicMeta))
}

func (h *ExternalHandler) persistNoteContent(ctx context.Context, file *db.File, content string, resetCRDT bool) error {
	contentBytes := []byte(content)
	if h.BlobStore != nil {
		blobKey := file.ID
		if file.BlobPath != nil && *file.BlobPath != "" {
			blobKey = *file.BlobPath
		} else {
			file.BlobPath = &blobKey
		}
		if err := h.BlobStore.Put(ctx, blobKey, bytes.NewReader(contentBytes)); err != nil {
			return err
		}
		file.Content = nil
	} else {
		file.Content = contentBytes
	}
	file.Size = int64(len(contentBytes))
	if resetCRDT {
		if err := h.Store.ResetFileCRDTState(ctx, file.ID, h.BlobStore != nil); err != nil {
			return err
		}
		file.SnapshotSeqID = 0
		file.SnapshotIV = nil
	}
	return nil
}

func (h *ExternalHandler) writeNotePayload(
	w http.ResponseWriter, ctx context.Context, status int,
	file *db.File, metaMap map[string]interface{}, title, content, encMessage string, encrypted bool,
) {
	safe := extractMetaString(metaMap, "safe")
	if safe == "" {
		safe = h.getFileSafe(ctx, file)
	} else {
		safe = normSafeName(safe)
	}
	note := db.ExternalNote{
		ID: file.ID, Title: title, Content: content, ParentID: file.ParentID,
		Safe: safe, LinkedSafes: extractMetaStringSlice(metaMap, "linkedSafes"),
		TagIDs: extractMetaStringSlice(metaMap, "tagIds"), Icon: extractMetaString(metaMap, "icon"),
		Color: extractMetaString(metaMap, "color"), Encrypted: encrypted, Version: file.Version,
		CreatedAt: file.CreatedAt, UpdatedAt: file.UpdatedAt,
	}
	payload := map[string]interface{}{
		"id": note.ID, "title": note.Title, "content": note.Content, "parent_id": note.ParentID,
		"safe": note.Safe, "linked_safes": note.LinkedSafes, "tag_ids": note.TagIDs,
		"icon": note.Icon, "color": note.Color, "version": note.Version, "encrypted": note.Encrypted,
		"created_at": note.CreatedAt, "updated_at": note.UpdatedAt, "note": note,
	}
	if encMessage != "" {
		payload["message"] = encMessage
	}
	writeExternalJSON(w, status, payload)
}

func (h *ExternalHandler) emitNoteSSE(fileID, ownerID string, payload map[string]interface{}) {
	if b, err := json.Marshal(payload); err == nil {
		h.broadcastToFileUsers(fileID, ownerID, string(b))
	}
}

func (h *ExternalHandler) GetNote(w http.ResponseWriter, r *http.Request) {
	file, _, _, _, ok := h.loadScopedNote(w, r, false)
	if !ok {
		return
	}
	metaMap, isUnencrypted := parseNoteMeta(file)
	title := extractNoteTitle(file, metaMap)
	if !isUnencrypted {
		const encMsg = "This note is end-to-end encrypted and cannot be decrypted without the user's private key"
		h.writeNotePayload(w, r.Context(), http.StatusOK, file, metaMap, title, "", encMsg, true)
		return
	}
	h.writeNotePayload(w, r.Context(), http.StatusOK, file, metaMap, title, h.getNoteContent(r.Context(), file), "", false)
}

func (h *ExternalHandler) CreateNote(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	safes, folders := extractScopes(r)
	var req CreateExternalNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid request body")
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		title = "Untitled Note"
	}

	var parentID *string
	var parentFile *db.File
	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		parentID, parentFile, ok = h.validateNoteParent(w, r.Context(), userID, *req.ParentID, "", safes, folders,
			"Parent folder does not match scoped token folder", "Parent folder safe does not match scoped token workspace")
		if !ok {
			return
		}
	} else if len(folders) > 0 {
		parentID, parentFile, ok = h.validateNoteParent(w, r.Context(), userID, folders[0], "", safes, folders,
			"Parent folder does not match scoped token folder", "Parent folder safe does not match scoped token workspace")
		if !ok {
			return
		}
	}

	explicitSafe := strings.TrimSpace(req.Safe)
	if explicitSafe == "" {
		explicitSafe = strings.TrimSpace(req.Workspace)
	}
	resolvedSafe := "main"
	if explicitSafe != "" {
		resolvedSafe = normSafeName(explicitSafe)
		if len(safes) > 0 && !safeInList(resolvedSafe, safes) {
			writeExternalError(w, http.StatusForbidden, "Forbidden", "Requested workspace does not match scoped token workspace")
			return
		}
	} else if parentFile != nil {
		resolvedSafe = h.getFileSafe(r.Context(), parentFile)
	} else if len(safes) > 0 {
		resolvedSafe = normSafeName(safes[0])
	}

	metaMap := map[string]interface{}{"title": title, "unencrypted": true, "author": "external_api", "safe": resolvedSafe}
	if len(req.LinkedSafes) > 0 {
		metaMap["linkedSafes"] = req.LinkedSafes
	}
	if len(req.TagIDs) > 0 {
		metaMap["tagIds"] = req.TagIDs
	}
	if icon := strings.TrimSpace(req.Icon); icon != "" {
		metaMap["icon"] = icon
	}
	if color := strings.TrimSpace(req.Color); color != "" {
		metaMap["color"] = color
	}
	metaBytes, _ := json.Marshal(metaMap)

	now := time.Now().UTC()
	file := &db.File{
		ID: uuid.New().String(), OwnerID: userID, ParentID: parentID, Type: db.FileTypeNote,
		CreatedAt: now, UpdatedAt: now, Visibility: "private", Metadata: metaBytes, PublicMeta: metaBytes, Version: 2,
	}
	if err := h.persistNoteContent(r.Context(), file, req.Content, false); err != nil {
		log.Printf("CreateNote: failed to store blob for note %s: %v", file.ID, err)
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to store note content")
		return
	}
	if err := h.Store.CreateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to create note")
		return
	}

	h.emitNoteSSE(file.ID, userID, map[string]interface{}{"type": "file_created", "file_id": file.ID, "source": "external_api"})
	h.writeNotePayload(w, r.Context(), http.StatusCreated, file, metaMap, title, req.Content, "", false)
}

func (h *ExternalHandler) UpdateNote(w http.ResponseWriter, r *http.Request) {
	file, userID, safes, folders, ok := h.loadScopedNote(w, r, true)
	if !ok {
		return
	}
	var req UpdateExternalNoteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid request body")
		return
	}
	metaMap, isUnencrypted := parseNoteMeta(file)
	hasContentUpdate := req.Content != nil || req.AppendContent != nil
	if hasContentUpdate && !isUnencrypted {
		writeExternalJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error": "Bad Request", "encrypted": true,
			"message": "Cannot update content of an end-to-end encrypted note via external API. Note content is protected with client-side encryption.",
		})
		return
	}

	metaChanged := false
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			t = "Untitled Note"
		}
		metaMap["title"] = t
		metaChanged = true
	}

	explicitSafe := false
	if req.Safe != nil || req.Workspace != nil {
		rawSafe := ""
		if req.Safe != nil {
			rawSafe = *req.Safe
		} else {
			rawSafe = *req.Workspace
		}
		norm := normSafeName(rawSafe)
		if len(safes) > 0 && !safeInList(norm, safes) {
			writeExternalError(w, http.StatusForbidden, "Forbidden", "Requested workspace does not match scoped token workspace")
			return
		}
		metaMap["safe"] = norm
		metaChanged, explicitSafe = true, true
	}

	if req.ParentID != nil {
		trimmed := strings.TrimSpace(*req.ParentID)
		if trimmed == "" || trimmed == "__none__" {
			if len(folders) > 0 {
				writeExternalError(w, http.StatusForbidden, "Forbidden", "Cannot move note to root with folder-scoped token")
				return
			}
			file.ParentID = nil
		} else {
			resolved, parentFile, ok := h.validateNoteParent(w, r.Context(), userID, trimmed, file.ID, safes, folders,
				"Parent folder does not match scoped folder", "Parent folder does not match scoped workspace")
			if !ok {
				return
			}
			file.ParentID = resolved
			if !explicitSafe {
				metaMap["safe"] = h.getFileSafe(r.Context(), parentFile)
				metaChanged = true
			}
		}
	}

	metaChanged = setOptionalMetaSlice(metaMap, "linkedSafes", req.LinkedSafes) || metaChanged
	metaChanged = setOptionalMetaSlice(metaMap, "tagIds", req.TagIDs) || metaChanged
	metaChanged = setOptionalMetaStr(metaMap, "icon", req.Icon) || metaChanged
	metaChanged = setOptionalMetaStr(metaMap, "color", req.Color) || metaChanged
	if metaChanged {
		metaBytes, _ := json.Marshal(metaMap)
		file.Metadata, file.PublicMeta = metaBytes, metaBytes
		if isUnencrypted {
			file.SecuredMeta = nil
		}
	}

	contentChanged := false
	var updatedContent string
	if hasContentUpdate && isUnencrypted {
		if req.Content != nil {
			updatedContent = *req.Content
		} else {
			updatedContent = h.getNoteContent(r.Context(), file)
		}
		if req.AppendContent != nil && *req.AppendContent != "" {
			if updatedContent != "" && !strings.HasSuffix(updatedContent, "\n") {
				updatedContent += "\n"
			}
			updatedContent += *req.AppendContent
		}
		if err := h.persistNoteContent(r.Context(), file, updatedContent, true); err != nil {
			log.Printf("UpdateNote: failed to persist content for note %s: %v", file.ID, err)
			writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to store note content")
			return
		}
		contentChanged = true
	}

	if file.Version < 2 {
		file.Version = 2
	} else {
		file.Version++
	}
	file.UpdatedAt = time.Now().UTC()
	if err := h.Store.UpdateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to update note")
		return
	}

	title := extractNoteTitle(file, metaMap)
	if isUnencrypted && !contentChanged {
		updatedContent = h.getNoteContent(r.Context(), file)
	}
	h.emitNoteSSE(file.ID, file.OwnerID, map[string]interface{}{
		"type": "file_updated", "file_id": file.ID, "source": "external_api",
		"content_updated": contentChanged, "title": title, "metadata": metaMap,
	})
	h.writeNotePayload(w, r.Context(), http.StatusOK, file, metaMap, title, updatedContent, "", !isUnencrypted)
}

func (h *ExternalHandler) DeleteNote(w http.ResponseWriter, r *http.Request) {
	file, userID, _, _, ok := h.loadScopedNote(w, r, true)
	if !ok {
		return
	}
	if file.OwnerID != userID && !store.CanAdmin(file.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Only the note owner can delete this note")
		return
	}
	if r.URL.Query().Get("permanent") == "true" {
		blobPaths, err := h.Store.GetFileBlobPaths(r.Context(), file.ID)
		if err != nil {
			log.Printf("DeleteNote: failed to fetch blob paths for note %s: %v", file.ID, err)
		}
		if err := h.Store.DeleteFile(r.Context(), file.ID); err != nil {
			writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete note")
			return
		}
		h.cleanupNoteBlobs(r.Context(), file, blobPaths)
	} else if err := h.Store.SoftDeleteFile(r.Context(), file.ID); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete note")
		return
	}

	h.emitNoteSSE(file.ID, file.OwnerID, map[string]interface{}{"type": "file_deleted", "file_id": file.ID, "source": "external_api"})
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Note deleted successfully", "id": file.ID})
}

func (h *ExternalHandler) cleanupNoteBlobs(ctx context.Context, file *db.File, blobPaths []string) {
	if h.BlobStore == nil {
		return
	}
	candidates := make(map[string]struct{}, len(blobPaths)+1)
	for _, bp := range blobPaths {
		if bp != "" {
			candidates[bp] = struct{}{}
		}
	}
	if file.BlobPath != nil && *file.BlobPath != "" {
		candidates[*file.BlobPath] = struct{}{}
	}
	for blobPath := range candidates {
		refs, err := h.Store.CountBlobReferencesExcluding(ctx, blobPath, []string{file.ID})
		if err == nil && refs == 0 {
			if err := h.BlobStore.Delete(ctx, blobPath); err != nil {
				log.Printf("DeleteNote: failed to delete blob %s: %v", blobPath, err)
			}
		} else if err != nil {
			log.Printf("DeleteNote: failed to count blob references for %s: %v", blobPath, err)
		}
	}
}
