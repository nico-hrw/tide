package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/nicoh/tide/internal/db"
	"github.com/nicoh/tide/internal/store"
)

var (
	forbiddenSettingsKeys = map[string]bool{
		"pin": true, "new_pin": true, "pin_hash": true, "current_pin": true,
		"email": true, "new_email": true, "email_blind_index": true,
		"phone": true, "phone_blind_index": true, "password": true, "new_password": true,
		"vault": true, "encrypted_vault": true, "encrypted_pepper": true, "pepper": true,
		"public_key": true, "private_key": true, "master_key": true, "recovery_key": true,
		"login_code": true, "api_tokens": true, "tokens": true, "token": true,
		"whisper_token": true, "mobile_token": true, "delete_account": true,
	}
	allowedSettingsTopKeys = map[string]bool{"profile": true, "appearance": true, "notes": true, "calendar": true, "extensions": true, "presence": true}
	allowedExtensionIDs    = map[string]bool{
		"todos": true, "job_planner": true, "summary": true,
		"varsheet": true, "smart_island": true, "smart_date_detection": true,
		"references": true, "mobile_connection": true, "mcp": true, "file_support": true, "debug": true,
	}
	sectionEnumRules = map[string]map[string][]string{
		"profile":    {"avatar_style": {"notionists", "openPeeps"}},
		"appearance": {"theme": {"light", "dark", "system"}, "app_palette": {"tide", "warm", "slate"}, "language": {"en", "de"}, "navigation_mode": {"sidebar", "folders"}},
		"notes": {
			"note_layout": {"a4", "thin", "normal", "wide", "extra-wide"}, "note_margin": {"compact", "normal", "wide"},
			"paper_pattern": {"blanko", "ruled", "grid"}, "date_detection_mode": {"auto", "manual"},
			"event_mention_style": {"blue", "calendar"}, "event_mention_preview": {"always", "hover", "off"},
		},
		"calendar":                {"scroll_mode": {"infinite", "fixed"}, "overlap_mode": {"stack", "overlap"}, "color_palette": {"balsam", "modern-dark", "soft-pastels", "classic-tide"}, "holiday_package": {"DE", "AT", "CH", "US"}},
		"presence":                {"status": {"online", "away", "offline"}},
		"extensions.smart_island": {"message_preview_mode": {"full", "preview", "sender_only"}, "file_share_display": {"card", "compact"}},
		"extensions.job_planner":  {"mode": {"job", "study", "both"}},
		"extensions.references":   {"display_mode": {"magic", "underline-black", "underline-color", "icon", "emoji"}},
	}
)

type ProfileSettings struct {
	Username     string `json:"username"`
	Title        string `json:"title"`
	Bio          string `json:"bio"`
	AvatarStyle  string `json:"avatar_style"`
	AvatarSalt   string `json:"avatar_salt"`
	AvatarSeed   string `json:"avatar_seed"`
	Discoverable bool   `json:"discoverable"`
}

type ExtensionsSettings struct {
	Enabled     []string `json:"enabled"`
	SmartIsland struct {
		ExpandOnNotification        bool   `json:"expand_on_notification"`
		NotificationDurationSeconds int    `json:"notification_duration_seconds"`
		MessagePreviewMode          string `json:"message_preview_mode"`
		FileShareDisplay            string `json:"file_share_display"`
		ShowNoteSharedText          bool   `json:"show_note_shared_text"`
	} `json:"smart_island"`
	JobPlanner struct {
		Mode         string   `json:"mode"`
		ShowWeekends bool     `json:"show_weekends"`
		PluginTagIDs []string `json:"plugin_tag_ids"`
	} `json:"job_planner"`
	References struct {
		AutoScanEnabled bool   `json:"auto_scan_enabled"`
		DisplayMode     string `json:"display_mode"`
	} `json:"references"`
	MobileConnection struct {
		Enabled           bool   `json:"enabled"`
		ChannelID         string `json:"channel_id"`
		WidgetID          string `json:"widget_id"`
		NotifyUpcoming    bool   `json:"notify_upcoming"`
		NotifyDailyAgenda bool   `json:"notify_daily_agenda"`
		UpdateWidget      bool   `json:"update_widget"`
	} `json:"mobile_connection"`
}

type UserSettingsPayload struct {
	Profile    ProfileSettings `json:"profile"`
	Appearance struct {
		Theme          string `json:"theme"`
		AppPalette     string `json:"app_palette"`
		Language       string `json:"language"`
		NavigationMode string `json:"navigation_mode"`
	} `json:"appearance"`
	Notes struct {
		NoteLayout          string `json:"note_layout"`
		NoteMargin          string `json:"note_margin"`
		PaperPattern        string `json:"paper_pattern"`
		ShowPageBreaks      bool   `json:"show_page_breaks"`
		HeadingNumbering    bool   `json:"heading_numbering"`
		A4SideBorders       bool   `json:"a4_side_borders"`
		AnimatedEmoji       bool   `json:"animated_emoji"`
		DateDetectionMode   string `json:"date_detection_mode"`
		EventMentionStyle   string `json:"event_mention_style"`
		EventMentionPreview string `json:"event_mention_preview"`
	} `json:"notes"`
	Calendar struct {
		ScrollMode      string `json:"scroll_mode"`
		OverlapMode     string `json:"overlap_mode"`
		ColorPalette    string `json:"color_palette"`
		WeekStartsOn    int    `json:"week_starts_on"`
		HolidaysEnabled bool   `json:"holidays_enabled"`
		HolidayPackage  string `json:"holiday_package"`
	} `json:"calendar"`
	Extensions ExtensionsSettings `json:"extensions"`
	Presence   struct {
		Status string `json:"status"`
	} `json:"presence"`
}

func defaultUserSettingsPayload() UserSettingsPayload {
	var p UserSettingsPayload
	p.Profile = ProfileSettings{AvatarStyle: "notionists", Discoverable: true}
	p.Appearance.Theme, p.Appearance.AppPalette, p.Appearance.Language, p.Appearance.NavigationMode = "system", "tide", "en", "sidebar"
	p.Notes.NoteLayout, p.Notes.NoteMargin, p.Notes.PaperPattern, p.Notes.ShowPageBreaks, p.Notes.AnimatedEmoji = "normal", "normal", "blanko", true, true
	p.Notes.DateDetectionMode, p.Notes.EventMentionStyle, p.Notes.EventMentionPreview = "auto", "calendar", "hover"
	p.Calendar.ScrollMode, p.Calendar.OverlapMode, p.Calendar.ColorPalette, p.Calendar.WeekStartsOn, p.Calendar.HolidayPackage = "infinite", "stack", "classic-tide", 1, "DE"
	p.Extensions.Enabled = []string{}
	si := &p.Extensions.SmartIsland
	si.ExpandOnNotification, si.NotificationDurationSeconds, si.MessagePreviewMode, si.FileShareDisplay, si.ShowNoteSharedText = true, 6, "preview", "card", true
	p.Extensions.JobPlanner.Mode, p.Extensions.JobPlanner.PluginTagIDs = "both", []string{}
	p.Extensions.References.AutoScanEnabled, p.Extensions.References.DisplayMode = true, "magic"
	p.Extensions.MobileConnection.NotifyUpcoming = true
	p.Presence.Status = "online"
	return p
}

func findForbiddenKey(raw map[string]interface{}, path string) string {
	for k, v := range raw {
		fullPath := k
		if path != "" {
			fullPath = path + "." + k
		}
		if forbiddenSettingsKeys[strings.ToLower(strings.TrimSpace(k))] {
			return fullPath
		}
		switch typed := v.(type) {
		case map[string]interface{}:
			if bad := findForbiddenKey(typed, fullPath); bad != "" {
				return bad
			}
		case []interface{}:
			for i, elem := range typed {
				idxPath := fmt.Sprintf("%s[%d]", fullPath, i)
				if m, ok := elem.(map[string]interface{}); ok {
					if bad := findForbiddenKey(m, idxPath); bad != "" {
						return bad
					}
				} else if sub, ok := elem.([]interface{}); ok {
					if bad := findForbiddenKey(map[string]interface{}{"": sub}, idxPath); bad != "" {
						return bad
					}
				}
			}
		}
	}
	return ""
}

func deepMergeMap(dst, src map[string]interface{}) {
	for k, v := range src {
		if srcSub, ok := v.(map[string]interface{}); ok {
			if dstSub, ok := dst[k].(map[string]interface{}); ok {
				deepMergeMap(dstSub, srcSub)
				continue
			}
			copied := make(map[string]interface{}, len(srcSub))
			deepMergeMap(copied, srcSub)
			dst[k] = copied
			continue
		}
		dst[k] = v
	}
}

func validateSectionEnums(section string, m map[string]interface{}) error {
	for field, allowed := range sectionEnumRules[section] {
		v, exists := m[field]
		if !exists {
			continue
		}
		s, ok := v.(string)
		if !ok {
			return fmt.Errorf("%s.%s must be a string", section, field)
		}
		valid := false
		for _, a := range allowed {
			if valid = s == a; valid {
				break
			}
		}
		if !valid {
			return fmt.Errorf("invalid value '%s' for %s.%s; allowed: %s", s, section, field, strings.Join(allowed, ", "))
		}
	}
	return nil
}

func validateSettingsPatch(raw map[string]interface{}, bodyBytes []byte) error {
	for k, v := range raw {
		if !allowedSettingsTopKeys[k] {
			return fmt.Errorf("unknown top-level setting section '%s'", k)
		}
		sub, ok := v.(map[string]interface{})
		if !ok {
			return fmt.Errorf("section '%s' must be a JSON object", k)
		}
		if err := validateSectionEnums(k, sub); err != nil {
			return err
		}
	}
	var typeCheck UserSettingsPayload
	if err := json.Unmarshal(bodyBytes, &typeCheck); err != nil {
		return fmt.Errorf("invalid field type in settings payload: %v", err)
	}
	if p, ok := raw["profile"].(map[string]interface{}); ok {
		for field, b := range map[string][2]int{"username": {1, 64}, "title": {0, 120}, "bio": {0, 500}, "avatar_salt": {0, 100}, "avatar_seed": {0, 100}} {
			if v, exists := p[field]; exists {
				s, _ := v.(string)
				if field == "username" {
					s = strings.TrimSpace(s)
				}
				if n := utf8.RuneCountInString(s); n < b[0] || n > b[1] {
					return fmt.Errorf("profile.%s length must be between %d and %d characters", field, b[0], b[1])
				}
			}
		}
	}
	if c, ok := raw["calendar"].(map[string]interface{}); ok {
		if _, exists := c["week_starts_on"]; exists && typeCheck.Calendar.WeekStartsOn != 0 && typeCheck.Calendar.WeekStartsOn != 1 {
			return errors.New("invalid value for calendar.week_starts_on; allowed: 0, 1")
		}
	}
	if ext, ok := raw["extensions"].(map[string]interface{}); ok {
		if v, exists := ext["enabled"]; exists && v == nil {
			return errors.New("extensions.enabled must be an array of strings")
		}
		for _, id := range typeCheck.Extensions.Enabled {
			if !allowedExtensionIDs[id] {
				return fmt.Errorf("invalid or unsupported extension ID '%s'", id)
			}
		}
		for _, subKey := range []string{"smart_island", "job_planner", "references"} {
			if subMap, ok := ext[subKey].(map[string]interface{}); ok {
				if err := validateSectionEnums("extensions."+subKey, subMap); err != nil {
					return err
				}
			}
		}
		if si, ok := ext["smart_island"].(map[string]interface{}); ok {
			if _, exists := si["notification_duration_seconds"]; exists {
				switch typeCheck.Extensions.SmartIsland.NotificationDurationSeconds {
				case 4, 6, 8, 12:
				default:
					return errors.New("invalid value for extensions.smart_island.notification_duration_seconds; allowed: 4, 6, 8, 12")
				}
			}
		}
	}
	return nil
}

func (h *ExternalHandler) buildUserSettingsPayload(ctx context.Context, userID string) (UserSettingsPayload, error) {
	payload := defaultUserSettingsPayload()
	user, err := h.Store.GetUser(ctx, userID)
	if err != nil {
		return payload, err
	}
	payload.Profile.Username, payload.Profile.AvatarSeed = user.Username, userID
	profile, err := h.Store.GetProfile(ctx, userID)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return payload, err
	}
	if profile != nil {
		payload.Profile.Title, payload.Profile.Bio, payload.Profile.AvatarSalt = profile.Title, profile.Bio, profile.AvatarSalt
		if profile.AvatarStyle != "" {
			payload.Profile.AvatarStyle = profile.AvatarStyle
		}
		if profile.AvatarSeed != "" {
			payload.Profile.AvatarSeed = profile.AvatarSeed
		}
		payload.Profile.Discoverable = profile.ProfileStatus > 0
	}
	rec, err := h.Store.GetUserSettings(ctx, userID)
	if err != nil {
		return payload, err
	}
	if rec != nil && len(rec.Preferences) > 0 {
		savedProfile := payload.Profile
		if rawBytes, err := json.Marshal(rec.Preferences); err == nil {
			_ = json.Unmarshal(rawBytes, &payload)
		}
		payload.Profile = savedProfile
	}
	if exts, err := h.Store.GetUserExtensions(ctx, userID); err == nil && exts != nil {
		payload.Extensions.Enabled = exts
	}
	if payload.Extensions.Enabled == nil {
		payload.Extensions.Enabled = []string{}
	}
	if payload.Extensions.JobPlanner.PluginTagIDs == nil {
		payload.Extensions.JobPlanner.PluginTagIDs = []string{}
	}
	return payload, nil
}

func writeSettingsStoreError(w http.ResponseWriter, err error, fallback string) {
	if errors.Is(err, store.ErrNotFound) {
		writeExternalError(w, http.StatusNotFound, "Not Found", "User not found")
		return
	}
	writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", fallback)
}

func (h *ExternalHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Authentication required")
		return
	}
	settings, err := h.buildUserSettingsPayload(r.Context(), userID)
	if err != nil {
		writeSettingsStoreError(w, err, "Failed to load settings")
		return
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"settings": settings})
}

func (h *ExternalHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Authentication required")
		return
	}
	bodyBytes, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Failed to read request body")
		return
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &raw); err != nil || raw == nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", "Invalid JSON payload")
		return
	}
	if badKey := findForbiddenKey(raw, ""); badKey != "" {
		writeExternalError(w, http.StatusForbidden, "forbidden_setting",
			fmt.Sprintf("Setting '%s' cannot be modified via the Settings API for security reasons", badKey))
		return
	}
	if err := validateSettingsPatch(raw, bodyBytes); err != nil {
		writeExternalError(w, http.StatusBadRequest, "Bad Request", err.Error())
		return
	}
	if err := h.applySettingsUpdate(r.Context(), userID, raw); err != nil {
		writeSettingsStoreError(w, err, "Failed to update settings")
		return
	}
	fullSettings, err := h.buildUserSettingsPayload(r.Context(), userID)
	if err != nil {
		writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", "Failed to reload settings")
		return
	}
	if presMap, ok := raw["presence"].(map[string]interface{}); ok {
		if status, ok := presMap["status"].(string); ok && status != "" && h.Broker != nil {
			h.Broker.SetUserStatus(userID, status)
		}
	}
	if msgBytes, err := json.Marshal(map[string]interface{}{"type": "settings_updated", "settings": fullSettings}); err == nil {
		h.broadcastToUser(userID, string(msgBytes))
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"settings": fullSettings})
}

func (h *ExternalHandler) applyProfilePatch(ctx context.Context, userID string, profMap map[string]interface{}) error {
	if username, ok := profMap["username"].(string); ok {
		if err := h.Store.UpdateUserUsername(ctx, userID, strings.TrimSpace(username)); err != nil {
			return err
		}
	}
	profile, err := h.Store.GetProfile(ctx, userID)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return err
	}
	if profile == nil {
		profile = &db.Profile{UserID: userID, AvatarSeed: userID, AvatarStyle: "notionists", ProfileStatus: 1}
	}
	if profile.AvatarStyle == "" {
		profile.AvatarStyle = "notionists"
	}
	for field, dst := range map[string]*string{"title": &profile.Title, "bio": &profile.Bio, "avatar_style": &profile.AvatarStyle, "avatar_salt": &profile.AvatarSalt, "avatar_seed": &profile.AvatarSeed} {
		if v, ok := profMap[field].(string); ok {
			*dst = v
		}
	}
	if v, ok := profMap["discoverable"].(bool); ok {
		profile.ProfileStatus = 0
		if v {
			profile.ProfileStatus = 1
		}
	}
	return h.Store.UpsertProfile(ctx, profile)
}

func (h *ExternalHandler) applySettingsUpdate(ctx context.Context, userID string, raw map[string]interface{}) error {
	if _, err := h.Store.GetUser(ctx, userID); err != nil {
		return err
	}
	if profMap, ok := raw["profile"].(map[string]interface{}); ok {
		if err := h.applyProfilePatch(ctx, userID, profMap); err != nil {
			return err
		}
	}
	rec, err := h.Store.GetUserSettings(ctx, userID)
	if err != nil {
		return err
	}
	if rec.Preferences == nil {
		rec.Preferences = map[string]interface{}{}
	}
	for _, section := range []string{"appearance", "notes", "calendar", "presence", "extensions"} {
		secMap, ok := raw[section].(map[string]interface{})
		if !ok {
			continue
		}
		if section == "extensions" {
			if rawEnabled, exists := secMap["enabled"].([]interface{}); exists {
				seen, deduped := make(map[string]bool, len(rawEnabled)), make([]string, 0, len(rawEnabled))
				for _, item := range rawEnabled {
					if id, ok := item.(string); ok && !seen[id] {
						seen[id], deduped = true, append(deduped, id)
					}
				}
				encoded, err := json.Marshal(deduped)
				if err != nil {
					return err
				}
				if err := h.Store.UpdateUserExtensions(ctx, userID, encoded); err != nil {
					return err
				}
			}
			subExt := map[string]interface{}{}
			for k, v := range secMap {
				if k != "enabled" {
					subExt[k] = v
				}
			}
			secMap = subExt
		}
		if len(secMap) > 0 {
			deepMergeMap(rec.Preferences, map[string]interface{}{section: secMap})
		}
	}
	return h.Store.UpsertUserSettings(ctx, rec)
}
