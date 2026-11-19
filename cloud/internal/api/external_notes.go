package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
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
	Title    string  `json:"title"`
	Content  string  `json:"content"`
	ParentID *string `json:"parent_id"`
}

type UpdateExternalNoteRequest struct {
	Title    *string `json:"title"`
	Content  *string `json:"content"`
	ParentID *string `json:"parent_id"`
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
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
			if parsedLimit > 500 {
				limit = 500
			} else {
				limit = parsedLimit
			}
		}
	}

	notes, err := h.Store.ListNotesForExternalAPI(r.Context(), userID, search, 0)
	if err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve notes")
		return
	}

	if len(safes) > 0 || len(folders) > 0 {
		var filtered []*db.ExternalNoteListItem
		for _, n := range notes {
			f, err := h.Store.GetAccessibleFile(r.Context(), n.ID, userID)
			if err != nil {
				continue
			}
			if h.noteMatchesScope(r.Context(), f, safes, folders) {
				filtered = append(filtered, n)
			}
		}
		notes = filtered
	}

	if limit > 0 && len(notes) > limit {
		notes = notes[:limit]
	}

	writeExternalJSON(w, http.StatusOK, map[string]interface{}{
		"count": len(notes),
		"notes": notes,
	})
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
	if contentStr == "" && len(file.Content) > 0 {
		if utf8.Valid(file.Content) && !bytes.ContainsRune(file.Content, 0) {
			contentStr = string(file.Content)
		}
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

	if file.Type != db.FileTypeNote {
		writeExternalError(w, http.StatusNotFound, "Not Found", "Note not found")
		return nil, "", nil, nil, false
	}

	if requireWrite && !store.CanWrite(file.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Write permission required")
		return nil, "", nil, nil, false
	}

	safes, folders := extractScopes(r)
	if !h.noteMatchesScope(r.Context(), file, safes, folders) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Note does not belong to scoped workspace or folder")
		return nil, "", nil, nil, false
	}

	return file, userID, safes, folders, true
}

func (h *ExternalHandler) validateNoteParent(
	w http.ResponseWriter,
	ctx context.Context,
	userID, rawParentID string,
	safes, folders []string,
	folderMismatchMsg, safeMismatchMsg string,
) (*string, bool) {
	cleanParentID := strings.TrimSpace(rawParentID)
	parentFile, err := h.Store.GetAccessibleFile(ctx, cleanParentID, userID)
	if err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Parent not found or access denied")
		return nil, false
	}
	if !store.CanWrite(parentFile.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Write permission required on parent")
		return nil, false
	}

	if len(folders) > 0 {
		matchesFolder := false
		for _, fID := range folders {
			if cleanParentID == fID {
				matchesFolder = true
				break
			}
		}
		if !matchesFolder {
			writeExternalError(w, http.StatusForbidden, "Forbidden", folderMismatchMsg)
			return nil, false
		}
	}

	if len(safes) > 0 {
		parentSafe := h.getFileSafe(ctx, parentFile)
		matchesSafe := false
		for _, s := range safes {
			if normSafeName(s) == parentSafe {
				matchesSafe = true
				break
			}
		}
		if !matchesSafe {
			writeExternalError(w, http.StatusForbidden, "Forbidden", safeMismatchMsg)
			return nil, false
		}
	}

	return &cleanParentID, true
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
	title := ""
	if metaMap != nil {
		if t, ok := metaMap["title"].(string); ok {
			title = t
		}
	}
	if title == "" {
		title = store.ParseNoteTitle(string(file.Metadata), string(file.PublicMeta))
	}
	return title
}

func writeNotePayload(
	w http.ResponseWriter,
	status int,
	id, title, content string,
	parentID *string,
	encrypted bool,
	createdAt, updatedAt time.Time,
) {
	writeExternalJSON(w, status, map[string]interface{}{
		"id":         id,
		"title":      title,
		"content":    content,
		"parent_id":  parentID,
		"encrypted":  encrypted,
		"created_at": createdAt,
		"updated_at": updatedAt,
		"note": map[string]interface{}{
			"id":         id,
			"title":      title,
			"content":    content,
			"parent_id":  parentID,
			"created_at": createdAt,
			"updated_at": updatedAt,
		},
	})
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
		writeExternalJSON(w, http.StatusOK, map[string]interface{}{
			"id":         file.ID,
			"title":      title,
			"encrypted":  true,
			"message":    encMsg,
			"parent_id":  file.ParentID,
			"created_at": file.CreatedAt,
			"updated_at": file.UpdatedAt,
			"note": map[string]interface{}{
				"id":         file.ID,
				"title":      title,
				"encrypted":  true,
				"message":    encMsg,
				"parent_id":  file.ParentID,
				"created_at": file.CreatedAt,
				"updated_at": file.UpdatedAt,
			},
		})
		return
	}

	contentStr := h.getNoteContent(r.Context(), file)
	writeNotePayload(w, http.StatusOK, file.ID, title, contentStr, file.ParentID, false, file.CreatedAt, file.UpdatedAt)
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
	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		resolved, ok := h.validateNoteParent(
			w, r.Context(), userID, *req.ParentID, safes, folders,
			"Parent folder does not match scoped token folder",
			"Parent folder safe does not match scoped token workspace",
		)
		if !ok {
			return
		}
		parentID = resolved
	} else if len(folders) > 0 {
		parentID = &folders[0]
	}

	now := time.Now().UTC()
	fileID := uuid.New().String()
	contentBytes := []byte(req.Content)

	metaMap := map[string]interface{}{
		"title":       title,
		"unencrypted": true,
		"author":      "external_api",
	}
	if len(safes) > 0 {
		metaMap["safe"] = normSafeName(safes[0])
	} else if parentID != nil {
		if pf, err := h.Store.GetAccessibleFile(r.Context(), *parentID, userID); err == nil {
			metaMap["safe"] = h.getFileSafe(r.Context(), pf)
		}
	}

	metaBytes, _ := json.Marshal(metaMap)

	file := &db.File{
		ID:         fileID,
		OwnerID:    userID,
		ParentID:   parentID,
		Type:       db.FileTypeNote,
		Size:       int64(len(contentBytes)),
		CreatedAt:  now,
		UpdatedAt:  now,
		Visibility: "private",
		Metadata:   metaBytes,
		PublicMeta: metaBytes,
		Version:    1,
		Content:    contentBytes,
	}

	if h.BlobStore != nil {
		if err := h.BlobStore.Put(r.Context(), fileID, bytes.NewReader(contentBytes)); err == nil {
			path := fileID
			file.BlobPath = &path
		}
	}

	if err := h.Store.CreateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to create note")
		return
	}

	createdNote := &db.ExternalNote{
		ID:        fileID,
		Title:     title,
		Content:   req.Content,
		ParentID:  parentID,
		CreatedAt: now,
		UpdatedAt: now,
	}

	writeExternalJSON(w, http.StatusCreated, map[string]interface{}{
		"id":         createdNote.ID,
		"title":      createdNote.Title,
		"content":    createdNote.Content,
		"parent_id":  createdNote.ParentID,
		"encrypted":  false,
		"created_at": createdNote.CreatedAt,
		"updated_at": createdNote.UpdatedAt,
		"note":       createdNote,
	})
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

	if req.Content != nil && !isUnencrypted {
		writeExternalJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":     "Bad Request",
			"message":   "Cannot update content of an end-to-end encrypted note via external API. Note content is protected with client-side encryption.",
			"encrypted": true,
		})
		return
	}

	if req.Title != nil {
		metaMap["title"] = *req.Title
		metaBytes, _ := json.Marshal(metaMap)
		file.Metadata = metaBytes
		file.PublicMeta = metaBytes
	}

	if req.Content != nil && isUnencrypted {
		contentBytes := []byte(*req.Content)
		file.Content = contentBytes
		file.Size = int64(len(contentBytes))
		blobKey := file.ID
		if file.BlobPath != nil && *file.BlobPath != "" {
			blobKey = *file.BlobPath
		} else {
			file.BlobPath = &blobKey
		}
		if h.BlobStore != nil {
			_ = h.BlobStore.Put(r.Context(), blobKey, bytes.NewReader(contentBytes))
		}
	}

	if req.ParentID != nil {
		if strings.TrimSpace(*req.ParentID) == "" {
			if len(folders) > 0 {
				writeExternalError(w, http.StatusForbidden, "Forbidden", "Cannot move note to root with folder-scoped token")
				return
			}
			file.ParentID = nil
		} else {
			resolved, ok := h.validateNoteParent(
				w, r.Context(), userID, *req.ParentID, safes, folders,
				"Parent folder does not match scoped folder",
				"Parent folder does not match scoped workspace",
			)
			if !ok {
				return
			}
			file.ParentID = resolved
		}
	}

	file.UpdatedAt = time.Now().UTC()

	if err := h.Store.UpdateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to update note")
		return
	}

	contentStr := ""
	if isUnencrypted {
		contentStr = h.getNoteContent(r.Context(), file)
	}
	title := extractNoteTitle(file, metaMap)

	writeNotePayload(w, http.StatusOK, file.ID, title, contentStr, file.ParentID, !isUnencrypted, file.CreatedAt, file.UpdatedAt)
}

func (h *ExternalHandler) DeleteNote(w http.ResponseWriter, r *http.Request) {
	file, _, _, _, ok := h.loadScopedNote(w, r, true)
	if !ok {
		return
	}

	if err := h.Store.DeleteFile(r.Context(), file.ID); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete note")
		return
	}

	writeExternalJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Note deleted successfully",
		"id":      file.ID,
	})
}
