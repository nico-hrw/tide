package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/store"
)

func (h *ExternalHandler) ListEvents(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	q := r.URL.Query()

	// Parse start / from date
	var startTime *time.Time
	startStr := q.Get("start")
	if startStr == "" {
		startStr = q.Get("from")
	}
	if startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			startTime = &t
		} else if t, err := time.Parse("2006-01-02", startStr); err == nil {
			startTime = &t
		} else {
			writeExternalError(w, http.StatusBadRequest, "Bad Request",
				"Invalid 'start' format. Use ISO 8601 / RFC 3339 (e.g. 2026-10-13T00:00:00Z or 2026-10-13).")
			return
		}
	}

	// Parse end / to date
	var endTime *time.Time
	endStr := q.Get("end")
	if endStr == "" {
		endStr = q.Get("to")
	}
	if endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			endTime = &t
		} else if t, err := time.Parse("2006-01-02", endStr); err == nil {
			// Include the whole end day
			endOfDay := t.Add(23*time.Hour + 59*time.Minute + 59*time.Second)
			endTime = &endOfDay
		} else {
			writeExternalError(w, http.StatusBadRequest, "Bad Request",
				"Invalid 'end' format. Use ISO 8601 / RFC 3339 (e.g. 2026-10-13T23:59:59Z or 2026-10-13).")
			return
		}
	}

	// Search text
	search := q.Get("search")
	if search == "" {
		search = q.Get("q")
	}

	// Limit
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

	events, err := h.Store.ListEventsForExternalAPI(r.Context(), userID, startTime, endTime, search, limit)
	if err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve events")
		return
	}

	writeExternalJSON(w, http.StatusOK, map[string]interface{}{
		"count":  len(events),
		"events": events,
	})
}

func (h *ExternalHandler) GetEvent(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	eventID := chi.URLParam(r, "id")
	if eventID == "" {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Missing event ID")
		return
	}

	event, err := h.Store.GetEventForExternalAPI(r.Context(), userID, eventID)
	if err != nil {
		if err == store.ErrNotFound {
			writeExternalError(w, http.StatusNotFound, "Not Found", "Event not found")
			return
		}
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to retrieve event")
		return
	}

	writeExternalJSON(w, http.StatusOK, map[string]interface{}{
		"event": event,
	})
}
