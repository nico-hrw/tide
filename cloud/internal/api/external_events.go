package api

import (
	"context"
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

type CreateExternalEventRequest struct {
	Title          string   `json:"title"`
	Start          string   `json:"start"`
	End            string   `json:"end"`
	AllDay         bool     `json:"all_day"`
	Color          string   `json:"color"`
	Description    string   `json:"description"`
	Location       string   `json:"location"`
	ParentID       *string  `json:"parent_id"`
	GroupIDs       []string `json:"group_ids"`
	TagIDs         []string `json:"tag_ids"`
	RecurrenceRule string   `json:"recurrence_rule"`
	RecurrenceEnd  string   `json:"recurrence_end"`
	Exdates        []string `json:"exdates"`
	CompletedDates []string `json:"completed_dates"`
	IsTask         bool     `json:"is_task"`
	IsCompleted    bool     `json:"is_completed"`
	IsCancelled    bool     `json:"is_cancelled"`
	IsImportant    bool     `json:"is_important"`
	Effect         string   `json:"effect"`
}

type UpdateExternalEventRequest struct {
	Title          *string   `json:"title"`
	Start          *string   `json:"start"`
	End            *string   `json:"end"`
	AllDay         *bool     `json:"all_day"`
	Color          *string   `json:"color"`
	Description    *string   `json:"description"`
	Location       *string   `json:"location"`
	ParentID       *string   `json:"parent_id"`
	GroupIDs       *[]string `json:"group_ids"`
	TagIDs         *[]string `json:"tag_ids"`
	RecurrenceRule *string   `json:"recurrence_rule"`
	RecurrenceEnd  *string   `json:"recurrence_end"`
	Exdates        *[]string `json:"exdates"`
	CompletedDates *[]string `json:"completed_dates"`
	IsTask         *bool     `json:"is_task"`
	IsCompleted    *bool     `json:"is_completed"`
	IsCancelled    *bool     `json:"is_cancelled"`
	IsImportant    *bool     `json:"is_important"`
	Effect         *string   `json:"effect"`
}

func (h *ExternalHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireExtUserID(w, r)
	if !ok {
		return
	}
	q := r.URL.Query()
	startTime, valid := parseQueryEventDate(firstNonEmpty(q.Get("start"), q.Get("from")), false)
	if !valid {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'start' format. Use ISO 8601 / RFC 3339.")
		return
	}
	endTime, valid := parseQueryEventDate(firstNonEmpty(q.Get("end"), q.Get("to")), true)
	if !valid {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'end' format. Use ISO 8601 / RFC 3339.")
		return
	}
	limit := 100
	if limitStr := q.Get("limit"); limitStr != "" {
		parsed, err := strconv.Atoi(limitStr)
		if err != nil || parsed <= 0 {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'limit' parameter: must be a positive integer")
			return
		}
		if parsed > 500 {
			limit = 500
		} else {
			limit = parsed
		}
	}
	search := firstNonEmpty(q.Get("search"), q.Get("q"))
	groupFilter := strings.TrimSpace(firstNonEmpty(q.Get("group_id"), q.Get("tag_id")))
	parentFilter := strings.TrimSpace(q.Get("parent_id"))
	fetchLimit := limit
	if groupFilter != "" || parentFilter != "" {
		fetchLimit = 0
	}
	events, err := h.Store.ListEventsForExternalAPI(r.Context(), userID, startTime, endTime, search, fetchLimit)
	if err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve events")
		return
	}
	if groupFilter != "" || parentFilter != "" {
		filtered := make([]*db.ExternalEvent, 0, len(events))
		for _, ev := range events {
			if parentFilter != "" && (ev.ParentID == nil || *ev.ParentID != parentFilter) {
				continue
			}
			if groupFilter != "" && (ev.ParentID == nil || *ev.ParentID != groupFilter) && !containsStr(ev.GroupIDs, groupFilter) {
				continue
			}
			filtered = append(filtered, ev)
		}
		if len(filtered) > limit {
			filtered = filtered[:limit]
		}
		events = filtered
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"count": len(events), "events": events})
}

func (h *ExternalHandler) GetEvent(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireExtUserID(w, r)
	if !ok {
		return
	}
	eventID := chi.URLParam(r, "id")
	if eventID == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Missing event ID")
		return
	}
	event, err := h.Store.GetEventForExternalAPI(r.Context(), userID, eventID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeExternalError(w, http.StatusNotFound, "Not Found", "Event not found")
			return
		}
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve event")
		return
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"event": event})
}

func (h *ExternalHandler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	userID, ok := requireExtUserID(w, r)
	if !ok {
		return
	}
	var req CreateExternalEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid request body")
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Event title is required")
		return
	}
	startTime, startNorm, ok := parseEventDateTime(req.Start)
	if !ok {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid or missing 'start'")
		return
	}
	var endTime time.Time
	var endNorm string
	if strings.TrimSpace(req.End) == "" {
		if req.AllDay {
			endTime = time.Date(startTime.Year(), startTime.Month(), startTime.Day(), 23, 59, 59, 0, startTime.Location())
		} else {
			endTime = startTime.Add(time.Hour)
		}
		endNorm = endTime.Format(time.RFC3339)
	} else {
		var endOK bool
		if endTime, endNorm, endOK = parseEventDateTime(req.End); !endOK || endTime.Before(startTime) {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'end' date or 'end' < 'start'")
			return
		}
	}
	groupIDs := cleanStringSlice(req.GroupIDs)
	if len(groupIDs) == 0 {
		groupIDs = cleanStringSlice(req.TagIDs)
	}
	var parentID *string
	if req.ParentID != nil {
		if t := strings.TrimSpace(*req.ParentID); t != "" && t != "__none__" {
			parentID = &t
		}
	}
	if len(groupIDs) > 0 && parentID == nil {
		p := groupIDs[0]
		parentID = &p
	} else if parentID != nil && *parentID != "" && len(groupIDs) == 0 {
		groupIDs = []string{*parentID}
	}
	if parentID != nil {
		if code, msg := h.validateEventParent(r.Context(), userID, *parentID); code != 0 {
			writeExternalError(w, code, http.StatusText(code), msg)
			return
		}
	}
	metaMap := map[string]interface{}{
		"has_custom_password": false, "unencrypted": true, "author": "external_api",
		"title": title, "start": startNorm, "end": endNorm, "allDay": req.AllDay,
		"color": req.Color, "description": req.Description, "location": req.Location,
		"groupIds": groupIDs, "recurrence_rule": req.RecurrenceRule, "recurrence_end": req.RecurrenceEnd,
		"exdates": cleanStringSlice(req.Exdates), "completed_dates": cleanStringSlice(req.CompletedDates),
		"is_task": req.IsTask, "is_completed": req.IsCompleted,
		"is_cancelled": req.IsCancelled, "is_important": req.IsImportant, "effect": req.Effect,
	}
	metaBytes, _ := json.Marshal(metaMap)
	pubBytes, _ := json.Marshal(map[string]interface{}{"title": title})
	now := time.Now().UTC()
	file := &db.File{
		ID: uuid.New().String(), OwnerID: userID, ParentID: parentID, Type: db.FileTypeEvent,
		CreatedAt: now, UpdatedAt: now, Visibility: "private", PublicMeta: pubBytes, Metadata: metaBytes, Version: 2,
	}
	if err := h.Store.CreateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to create event")
		return
	}
	h.broadcastEventSSE(file, map[string]interface{}{"type": "file_created", "file_id": file.ID, "source": "external_api"})
	writeExternalJSON(w, http.StatusCreated, map[string]interface{}{"event": buildExternalEventResponse(file, metaMap)})
}

func (h *ExternalHandler) UpdateEvent(w http.ResponseWriter, r *http.Request) {
	file, userID, ok := h.loadEventFile(w, r)
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
			"message":   "Cannot overwrite an end-to-end encrypted event via external API",
		})
		return
	}
	var req UpdateExternalEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid request body")
		return
	}
	metaMap := parseEventMetaMap(file)
	if req.Title != nil {
		trimmed := strings.TrimSpace(*req.Title)
		if trimmed == "" {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Event title cannot be empty")
			return
		}
		metaMap["title"] = trimmed
	}
	if req.AllDay != nil {
		metaMap["allDay"] = *req.AllDay
		delete(metaMap, "all_day")
	}
	if req.Start != nil {
		_, sNorm, ok := parseEventDateTime(*req.Start)
		if !ok {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'start' format")
			return
		}
		metaMap["start"] = sNorm
	}
	if req.End != nil {
		_, eNorm, ok := parseEventDateTime(*req.End)
		if !ok {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid 'end' format")
			return
		}
		metaMap["end"] = eNorm
	}
	if req.Start != nil || req.End != nil {
		curStart, _ := metaMap["start"].(string)
		curEnd, _ := metaMap["end"].(string)
		sTime, _, sOK := parseEventDateTime(curStart)
		eTime, _, eOK := parseEventDateTime(curEnd)
		if !sOK || (curEnd != "" && !eOK) || (eOK && eTime.Before(sTime)) {
			writeExternalError(w, http.StatusBadRequest, "Bad Request", "Event 'end' must be >= 'start'")
			return
		}
	}
	applyEventMetaUpdates(metaMap, &req)
	if !h.syncEventParentAndGroups(w, r.Context(), userID, file, metaMap, &req) {
		return
	}
	metaMap["has_custom_password"] = false
	metaMap["unencrypted"] = true
	if _, exists := metaMap["author"]; !exists {
		metaMap["author"] = "external_api"
	}
	title, _ := metaMap["title"].(string)
	file.Metadata, _ = json.Marshal(metaMap)
	file.PublicMeta, _ = json.Marshal(map[string]interface{}{"title": title})
	file.SecuredMeta = nil
	if file.Version < 2 {
		file.Version = 2
	} else {
		file.Version++
	}
	file.UpdatedAt = time.Now().UTC()
	if err := h.Store.UpdateFile(r.Context(), file); err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to update event")
		return
	}
	h.broadcastEventSSE(file, map[string]interface{}{
		"type": "file_updated", "file_id": file.ID, "source": "external_api", "title": title, "metadata": metaMap,
	})
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"event": buildExternalEventResponse(file, metaMap)})
}

func (h *ExternalHandler) DeleteEvent(w http.ResponseWriter, r *http.Request) {
	file, userID, ok := h.loadEventFile(w, r)
	if !ok {
		return
	}
	if r.URL.Query().Get("permanent") == "true" {
		if file.OwnerID != userID && !store.CanAdmin(file.Permission) {
			writeExternalError(w, http.StatusForbidden, "Forbidden", "Only owner or admin can permanently delete this event")
			return
		}
		if err := h.Store.DeleteFile(r.Context(), file.ID); err != nil {
			writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete event")
			return
		}
	} else {
		if file.OwnerID != userID && !store.CanWrite(file.Permission) {
			writeExternalError(w, http.StatusForbidden, "Forbidden", "Write permission required to delete this event")
			return
		}
		if err := h.Store.SoftDeleteFile(r.Context(), file.ID); err != nil {
			writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to delete event")
			return
		}
	}
	h.broadcastEventSSE(file, map[string]interface{}{"type": "file_deleted", "file_id": file.ID, "source": "external_api"})
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"success": true, "message": "Event deleted successfully", "id": file.ID})
}

func (h *ExternalHandler) loadEventFile(w http.ResponseWriter, r *http.Request) (*db.File, string, bool) {
	userID, ok := requireExtUserID(w, r)
	if !ok {
		return nil, "", false
	}
	eventID := chi.URLParam(r, "id")
	if eventID == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Missing event ID")
		return nil, "", false
	}
	file, err := h.Store.GetAccessibleFile(r.Context(), eventID, userID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeExternalError(w, http.StatusNotFound, "Not Found", "Event not found")
			return nil, "", false
		}
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve event")
		return nil, "", false
	}
	if file.Type != db.FileTypeEvent || isEventSoftDeleted(file) {
		writeExternalError(w, http.StatusNotFound, "Not Found", "Event not found")
		return nil, "", false
	}
	return file, userID, true
}

func (h *ExternalHandler) syncEventParentAndGroups(w http.ResponseWriter, ctx context.Context, userID string, file *db.File, metaMap map[string]interface{}, req *UpdateExternalEventRequest) bool {
	var incoming *[]string
	if req.GroupIDs != nil {
		c := cleanStringSlice(*req.GroupIDs)
		incoming = &c
	} else if req.TagIDs != nil {
		c := cleanStringSlice(*req.TagIDs)
		incoming = &c
	}
	if req.ParentID != nil {
		trimmed := strings.TrimSpace(*req.ParentID)
		if trimmed == "" || trimmed == "__none__" {
			file.ParentID = nil
			if incoming == nil {
				metaMap["groupIds"] = []string{}
			}
		} else {
			if code, msg := h.validateEventParent(ctx, userID, trimmed); code != 0 {
				writeExternalError(w, code, http.StatusText(code), msg)
				return false
			}
			file.ParentID = &trimmed
			if incoming == nil && len(metaStringSlice(metaMap["groupIds"])) == 0 {
				metaMap["groupIds"] = []string{trimmed}
			}
		}
	}
	if incoming != nil {
		metaMap["groupIds"] = *incoming
		if req.ParentID == nil {
			if len(*incoming) > 0 && (file.ParentID == nil || *file.ParentID == "") {
				p := (*incoming)[0]
				if code, msg := h.validateEventParent(ctx, userID, p); code != 0 {
					writeExternalError(w, code, http.StatusText(code), msg)
					return false
				}
				file.ParentID = &p
			} else if len(*incoming) == 0 {
				file.ParentID = nil
			}
		}
	}
	return true
}

func (h *ExternalHandler) validateEventParent(ctx context.Context, userID, parentID string) (int, string) {
	pf, err := h.Store.GetAccessibleFile(ctx, parentID, userID)
	if err != nil || isEventSoftDeleted(pf) {
		return http.StatusBadRequest, "Parent not found or access denied"
	}
	if !store.CanWrite(pf.Permission) {
		return http.StatusForbidden, "Write permission required on parent"
	}
	return 0, ""
}

func (h *ExternalHandler) broadcastEventSSE(file *db.File, payload map[string]interface{}) {
	if b, err := json.Marshal(payload); err == nil {
		h.broadcastToFileUsers(file.ID, file.OwnerID, string(b))
	}
}

func requireExtUserID(w http.ResponseWriter, r *http.Request) (string, bool) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return "", false
	}
	return userID, true
}

func parseQueryEventDate(raw string, isEnd bool) (*time.Time, bool) {
	if raw == "" {
		return nil, true
	}
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return &t, true
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		if isEnd {
			t = t.Add(24*time.Hour - time.Nanosecond)
		}
		return &t, true
	}
	return nil, false
}

func parseEventDateTime(raw string) (time.Time, string, bool) {
	s := strings.TrimSpace(raw)
	for _, layout := range []string{time.RFC3339, time.RFC3339Nano} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, t.Format(time.RFC3339), true
		}
	}
	for _, layout := range []string{"2006-01-02T15:04:05", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			utc := t.UTC()
			return utc, utc.Format(time.RFC3339), true
		}
	}
	return time.Time{}, "", false
}

func isEventSoftDeleted(file *db.File) bool {
	if file == nil || len(file.Metadata) == 0 {
		return false
	}
	var meta map[string]interface{}
	if err := json.Unmarshal(file.Metadata, &meta); err != nil {
		return false
	}
	v, ok := meta["deleted_at"]
	return ok && v != nil
}

func parseEventMetaMap(file *db.File) map[string]interface{} {
	meta := make(map[string]interface{})
	if len(file.PublicMeta) > 0 && string(file.PublicMeta) != "{}" {
		_ = json.Unmarshal(file.PublicMeta, &meta)
	}
	if len(file.Metadata) > 0 && string(file.Metadata) != "{}" {
		var md map[string]interface{}
		if err := json.Unmarshal(file.Metadata, &md); err == nil {
			for k, v := range md {
				meta[k] = v
			}
		}
	}
	return meta
}

func applyEventMetaUpdates(meta map[string]interface{}, req *UpdateExternalEventRequest) {
	for k, v := range map[string]*string{
		"color": req.Color, "description": req.Description, "location": req.Location,
		"recurrence_rule": req.RecurrenceRule, "recurrence_end": req.RecurrenceEnd, "effect": req.Effect,
	} {
		if v != nil {
			meta[k] = *v
		}
	}
	for k, v := range map[string]*bool{
		"is_task": req.IsTask, "is_completed": req.IsCompleted, "is_cancelled": req.IsCancelled, "is_important": req.IsImportant,
	} {
		if v != nil {
			meta[k] = *v
		}
	}
	if req.Exdates != nil {
		meta["exdates"] = cleanStringSlice(*req.Exdates)
	}
	if req.CompletedDates != nil {
		meta["completed_dates"] = cleanStringSlice(*req.CompletedDates)
	}
}

func buildExternalEventResponse(file *db.File, meta map[string]interface{}) *db.ExternalEvent {
	strVal := func(k string) string { v, _ := meta[k].(string); return v }
	boolVal := func(keys ...string) bool {
		for _, k := range keys {
			if v, ok := meta[k].(bool); ok && v {
				return true
			}
		}
		return false
	}
	source := "tide"
	if strVal("gcal_id") != "" {
		source = "gcal"
	}
	return &db.ExternalEvent{
		ID: file.ID, Title: firstNonEmpty(strVal("title"), "Untitled Event"), Start: strVal("start"), End: strVal("end"),
		AllDay: boolVal("allDay", "all_day"), Color: strVal("color"), Description: strVal("description"), Location: strVal("location"),
		ParentID: file.ParentID, GroupIDs: metaStringSlice(meta["groupIds"]), Tags: metaStringSlice(meta["tags"]),
		RecurrenceRule: strVal("recurrence_rule"), RecurrenceEnd: strVal("recurrence_end"),
		Exdates: metaStringSlice(meta["exdates"]), CompletedDates: metaStringSlice(meta["completed_dates"]),
		IsTask: boolVal("is_task"), IsCompleted: boolVal("is_completed"),
		IsCancelled: boolVal("is_cancelled"), IsImportant: boolVal("is_important"),
		Effect: strVal("effect"), Version: file.Version, Source: source, CreatedAt: file.CreatedAt, UpdatedAt: file.UpdatedAt,
	}
}

func cleanStringSlice(in []string) []string {
	out := make([]string, 0, len(in))
	for _, s := range in {
		if t := strings.TrimSpace(s); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func metaStringSlice(raw interface{}) []string {
	switch v := raw.(type) {
	case []string:
		return v
	case []interface{}:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok && s != "" {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func containsStr(slice []string, target string) bool {
	for _, s := range slice {
		if s == target {
			return true
		}
	}
	return false
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
