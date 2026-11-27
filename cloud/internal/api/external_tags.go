package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

var allowedTagEffects = map[string]bool{
	"none": true, "stripes": true, "waves": true, "dots": true,
	"chess": true, "diamonds": true, "gradient": true, "bars": true, "dimmed": true,
}

type CreateExternalTagRequest struct {
	Title  string `json:"title"`
	Color  string `json:"color"`
	Effect string `json:"effect"`
}

type UpdateExternalTagRequest struct {
	Title  *string `json:"title"`
	Color  *string `json:"color"`
	Effect *string `json:"effect"`
}

func parseTagMeta(raw json.RawMessage) map[string]interface{} {
	var m map[string]interface{}
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &m)
	}
	if m == nil {
		return map[string]interface{}{}
	}
	return m
}

func tagMetaString(primary, fallback map[string]interface{}, key string) string {
	if v, _ := primary[key].(string); v != "" {
		return v
	}
	v, _ := fallback[key].(string)
	return v
}

func fileToExternalTag(file *db.File) db.ExternalTag {
	meta, pub := parseTagMeta(file.Metadata), parseTagMeta(file.PublicMeta)
	effect := tagMetaString(meta, pub, "effect")
	if effect == "" {
		effect = "none"
	}
	return db.ExternalTag{
		ID: file.ID, Title: tagMetaString(meta, pub, "title"), Color: tagMetaString(meta, pub, "color"),
		Effect: effect, Version: file.Version, CreatedAt: file.CreatedAt, UpdatedAt: file.UpdatedAt,
	}
}

func parseTagEffect(raw string) (string, bool) {
	effect := strings.TrimSpace(raw)
	if effect == "" {
		return "none", true
	}
	return effect, allowedTagEffects[effect]
}

func requireTagUser(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	return userID, true
}

func (h *ExternalHandler) broadcastTagEvent(file *db.File, payload map[string]interface{}) {
	if file == nil {
		return
	}
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.broadcastToFileUsers(file.ID, file.OwnerID, string(data))
}

func (h *ExternalHandler) loadAccessibleTag(w http.ResponseWriter, r *http.Request) (*db.File, string, bool) {
	userID, ok := requireTagUser(w, r)
	if !ok {
		return nil, "", false
	}
	tagID := chi.URLParam(r, "id")
	if tagID == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Missing tag ID")
		return nil, "", false
	}
	file, err := h.Store.GetAccessibleFile(r.Context(), tagID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeExternalError(w, http.StatusNotFound, "Not Found", "Tag not found")
			return nil, "", false
		}
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve tag")
		return nil, "", false
	}
	if file.Type != db.FileTypeFolder || !isGroupFolder(file) || isSoftDeleted(file) {
		writeExternalError(w, http.StatusNotFound, "Not Found", "Tag not found")
		return nil, "", false
	}
	return file, userID, true
}

func (h *ExternalHandler) ListTags(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireTagUser(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	search := q.Get("search")
	if search == "" {
		search = q.Get("q")
	}
	limit := 100
	if limitStr := strings.TrimSpace(q.Get("limit")); limitStr != "" {
		parsedLimit, err := strconv.Atoi(limitStr)
		if err != nil || parsedLimit <= 0 {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'limit' parameter")
			return
		}
		limit = min(parsedLimit, 500)
	}
	files, err := h.Store.ListFoldersForExternalAPI(r.Context(), userID, true, true, search, limit)
	if err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve tags")
		return
	}
	tags := make([]db.ExternalTag, 0, len(files))
	for _, f := range files {
		tags = append(tags, fileToExternalTag(f))
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"count": len(tags), "tags": tags})
}

func (h *ExternalHandler) GetTag(w http.ResponseWriter, r *http.Request) {
	file, _, ok := h.loadAccessibleTag(w, r)
	if !ok {
		return
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"tag": fileToExternalTag(file)})
}
func (h *ExternalHandler) CreateTag(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireTagUser(w, r)
	if !ok {
		return
	}
	var req CreateExternalTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid request body")
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Title is required")
		return
	}
	effect, valid := parseTagEffect(req.Effect)
	if !valid {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid effect")
		return
	}
	color := strings.TrimSpace(req.Color)
	if color == "" {
		color = "#3b82f6"
	}
	now := time.Now().UTC()
	pubBytes, _ := json.Marshal(map[string]interface{}{"isGroup": true})
	metaBytes, _ := json.Marshal(map[string]interface{}{
		"title": title, "isGroup": true, "color": color, "effect": effect, "unencrypted": true, "author": "external_api",
	})
	file := &db.File{
		ID: uuid.New().String(), OwnerID: userID, Type: db.FileTypeFolder, CreatedAt: now, UpdatedAt: now,
		Visibility: "private", PublicMeta: pubBytes, Metadata: metaBytes, Version: 2,
	}
	if err := h.Store.CreateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to create tag")
		return
	}
	h.broadcastTagEvent(file, map[string]interface{}{"type": "file_created", "file_id": file.ID, "source": "external_api"})
	writeExternalJSON(w, http.StatusCreated, map[string]interface{}{"tag": fileToExternalTag(file)})
}

func (h *ExternalHandler) UpdateTag(w http.ResponseWriter, r *http.Request) {
	file, _, ok := h.loadAccessibleTag(w, r)
	if !ok {
		return
	}
	if !store.CanWrite(file.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Write permission required")
		return
	}
	if isProtectedE2EEFile(file) {
		writeExternalJSON(w, http.StatusBadRequest, map[string]interface{}{
			"error":     "Bad Request",
			"encrypted": true,
			"message":   "Cannot overwrite an end-to-end encrypted tag via external API",
		})
		return
	}
	var req UpdateExternalTagRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid request body")
		return
	}
	metaMap, pubMap := parseTagMeta(file.Metadata), parseTagMeta(file.PublicMeta)
	prevTitle := tagMetaString(metaMap, pubMap, "title")
	if req.Title != nil {
		title := strings.TrimSpace(*req.Title)
		if title == "" {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Title cannot be empty")
			return
		}
		metaMap["title"] = title
		if title != prevTitle {
			file.SecuredMeta = nil
		}
	}
	if req.Color != nil {
		metaMap["color"] = strings.TrimSpace(*req.Color)
	}
	if req.Effect != nil {
		effect, valid := parseTagEffect(*req.Effect)
		if !valid {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid effect")
			return
		}
		metaMap["effect"] = effect
	}
	pubMap["isGroup"], metaMap["isGroup"] = true, true
	file.PublicMeta, _ = json.Marshal(pubMap)
	file.Metadata, _ = json.Marshal(metaMap)
	file.Version = max(file.Version+1, 2)
	file.UpdatedAt = time.Now().UTC()
	if err := h.Store.UpdateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to update tag")
		return
	}
	h.broadcastTagEvent(file, map[string]interface{}{
		"type": "file_updated", "file_id": file.ID, "source": "external_api",
		"title": tagMetaString(metaMap, pubMap, "title"), "metadata": metaMap,
	})
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"tag": fileToExternalTag(file)})
}
func (h *ExternalHandler) DeleteTag(w http.ResponseWriter, r *http.Request) {
	file, userID, ok := h.loadAccessibleTag(w, r)
	if !ok {
		return
	}
	if file.OwnerID != userID && !store.CanAdmin(file.Permission) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Only the tag owner can delete this tag")
		return
	}
	var err error
	if r.URL.Query().Get("permanent") == "true" {
		err = h.Store.DeleteFile(r.Context(), file.ID)
	} else {
		err = h.Store.SoftDeleteFile(r.Context(), file.ID)
	}
	if err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete tag")
		return
	}
	h.broadcastTagEvent(file, map[string]interface{}{"type": "file_deleted", "file_id": file.ID, "source": "external_api"})
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Tag deleted successfully", "id": file.ID})
}
