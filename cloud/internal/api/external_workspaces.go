package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/nicoh/tide/internal/db"
)

func badWorkspaceReq(w http.ResponseWriter, msg string) {
	writeExternalError(w, http.StatusBadRequest, "Bad Request", msg)
}

func serverWorkspaceErr(w http.ResponseWriter, msg string) {
	writeExternalError(w, http.StatusInternalServerError, "Internal Server Error", msg)
}

func validateWorkspaceName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", errors.New("workspace name cannot be empty")
	}
	if name == "Standard" {
		name = "main"
	}
	if utf8.RuneCountInString(name) > 64 {
		return "", errors.New("workspace name must be 64 characters or fewer")
	}
	for _, r := range name {
		if unicode.IsControl(r) || r == '/' || r == '\\' {
			return "", errors.New("workspace name contains invalid characters")
		}
	}
	return name, nil
}

func parseWorkspaceURLParam(r *http.Request) (string, error) {
	unescaped, err := url.PathUnescape(chi.URLParam(r, "name"))
	if err != nil {
		return "", errors.New("invalid workspace name encoding")
	}
	if strings.TrimSpace(unescaped) == "" {
		return "", errors.New("missing workspace name")
	}
	return normSafeName(unescaped), nil
}

func mergeWorkspaceNames(configured []string, fileCounts map[string]int) ([]string, map[string]bool) {
	merged := make([]string, 0, len(configured)+len(fileCounts)+1)
	seen := map[string]bool{"main": true}
	merged = append(merged, "main")
	for _, ws := range configured {
		if norm := normSafeName(ws); !seen[norm] {
			seen[norm] = true
			merged = append(merged, norm)
		}
	}
	discovered := make([]string, 0, len(fileCounts))
	for ws := range fileCounts {
		discovered = append(discovered, normSafeName(ws))
	}
	sort.Strings(discovered)
	for _, ws := range discovered {
		if !seen[ws] {
			seen[ws] = true
			merged = append(merged, ws)
		}
	}
	return merged, seen
}

func assembleWorkspaceList(rec *db.UserSettingsRecord, fileCounts map[string]int, scopedSafes []string) ([]db.ExternalWorkspace, []string) {
	names, _ := mergeWorkspaceNames(rec.Workspaces, fileCounts)
	var allowed map[string]bool
	if len(scopedSafes) > 0 {
		allowed = make(map[string]bool, len(scopedSafes))
		for _, s := range scopedSafes {
			allowed[normSafeName(s)] = true
		}
	}
	activeSet := make(map[string]bool, len(rec.ActiveWorkspaces))
	activeOut := make([]string, 0, len(rec.ActiveWorkspaces))
	for _, a := range rec.ActiveWorkspaces {
		norm := normSafeName(a)
		if !activeSet[norm] && (allowed == nil || allowed[norm]) {
			activeSet[norm] = true
			activeOut = append(activeOut, norm)
		}
	}
	if len(activeOut) == 0 && allowed == nil {
		activeSet["main"], activeOut = true, []string{"main"}
	}
	list := make([]db.ExternalWorkspace, 0, len(names))
	for _, name := range names {
		if allowed == nil || allowed[name] {
			list = append(list, db.ExternalWorkspace{
				Name: name, IsDefault: name == "main", IsActive: activeSet[name], FileCount: fileCounts[name],
			})
		}
	}
	return list, activeOut
}

func (h *ExternalHandler) buildWorkspaceList(ctx context.Context, userID string, scopedSafes []string) ([]db.ExternalWorkspace, []string, error) {
	rec, err := h.Store.GetUserSettings(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	fileCounts, err := h.Store.DiscoverFileWorkspaces(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	list, active := assembleWorkspaceList(rec, fileCounts, scopedSafes)
	return list, active, nil
}

func (h *ExternalHandler) loadWorkspaceState(w http.ResponseWriter, r *http.Request) (string, *db.UserSettingsRecord, map[string]int, map[string]bool, bool) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Missing authenticated user")
		return "", nil, nil, nil, false
	}
	rec, err := h.Store.GetUserSettings(r.Context(), userID)
	if err != nil {
		serverWorkspaceErr(w, "Failed to load user settings")
		return "", nil, nil, nil, false
	}
	fileCounts, err := h.Store.DiscoverFileWorkspaces(r.Context(), userID)
	if err != nil {
		serverWorkspaceErr(w, "Failed to inspect workspaces")
		return "", nil, nil, nil, false
	}
	_, mergedSet := mergeWorkspaceNames(rec.Workspaces, fileCounts)
	return userID, rec, fileCounts, mergedSet, true
}

func (h *ExternalHandler) broadcastWorkspacesUpdated(userID string, workspaces, active []string, filesUpdated ...int64) {
	payload := map[string]interface{}{
		"type": "workspaces_updated", "workspaces": workspaces, "active_workspaces": active,
	}
	if len(filesUpdated) > 0 && filesUpdated[0] > 0 {
		payload["files_updated"] = filesUpdated[0]
	}
	if data, err := json.Marshal(payload); err == nil {
		h.broadcastToUser(userID, string(data))
	}
}

func findWorkspaceItem(list []db.ExternalWorkspace, name string) db.ExternalWorkspace {
	for _, item := range list {
		if item.Name == name {
			return item
		}
	}
	return db.ExternalWorkspace{Name: name, IsDefault: name == "main"}
}

func removeWorkspaceFromSlice(items []string, target string) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		if normSafeName(item) != target {
			out = append(out, item)
		}
	}
	return out
}

func (h *ExternalHandler) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	userID, ok := r.Context().Value("user_id").(string)
	if !ok || userID == "" {
		writeExternalError(w, http.StatusUnauthorized, "Unauthorized", "Missing authenticated user")
		return
	}
	safes, folders := extractScopes(r)
	if len(folders) > 0 && len(safes) == 0 {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Folder-scoped tokens cannot list all workspaces")
		return
	}
	list, active, err := h.buildWorkspaceList(r.Context(), userID, safes)
	if err != nil {
		serverWorkspaceErr(w, "Failed to load workspaces")
		return
	}
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{
		"count": len(list), "workspaces": list, "active_workspaces": active,
	})
}

func (h *ExternalHandler) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	userID, rec, fileCounts, mergedSet, ok := h.loadWorkspaceState(w, r)
	if !ok {
		return
	}
	safes, folders := extractScopes(r)
	if len(folders) > 0 {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Folder-scoped tokens cannot create workspaces")
		return
	}
	var req struct {
		Name   string `json:"name"`
		Active *bool  `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badWorkspaceReq(w, "Invalid JSON payload")
		return
	}
	name, err := validateWorkspaceName(req.Name)
	if err != nil {
		badWorkspaceReq(w, err.Error())
		return
	}
	if len(safes) > 0 && !safeInList(name, safes) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Workspace does not match scoped token workspace")
		return
	}
	if mergedSet[name] {
		writeExternalError(w, http.StatusConflict, "Conflict", "Workspace already exists")
		return
	}
	rec.Workspaces = append(rec.Workspaces, name)
	if req.Active != nil && *req.Active {
		rec.ActiveWorkspaces = append(rec.ActiveWorkspaces, name)
	}
	if err := h.Store.UpsertUserSettings(r.Context(), rec); err != nil {
		serverWorkspaceErr(w, "Failed to save workspace")
		return
	}
	h.broadcastWorkspacesUpdated(userID, rec.Workspaces, rec.ActiveWorkspaces)
	list, active := assembleWorkspaceList(rec, fileCounts, nil)
	writeExternalJSON(w, http.StatusCreated, map[string]interface{}{
		"workspace": findWorkspaceItem(list, name), "workspaces": list, "active_workspaces": active,
	})
}

func (h *ExternalHandler) UpdateWorkspace(w http.ResponseWriter, r *http.Request) {
	userID, rec, fileCounts, mergedSet, ok := h.loadWorkspaceState(w, r)
	if !ok {
		return
	}
	safes, folders := extractScopes(r)
	if len(folders) > 0 {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Folder-scoped tokens cannot modify workspaces")
		return
	}
	oldName, err := parseWorkspaceURLParam(r)
	if err != nil {
		badWorkspaceReq(w, err.Error())
		return
	}
	if len(safes) > 0 && !safeInList(oldName, safes) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Workspace does not match scoped token workspace")
		return
	}
	var req struct {
		NewName *string `json:"new_name"`
		Active  *bool   `json:"active"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		badWorkspaceReq(w, "Invalid JSON payload")
		return
	}
	targetName := oldName
	var updatedCount int64
	if req.NewName != nil {
		if oldName == "main" {
			badWorkspaceReq(w, "Cannot rename the default 'main' workspace")
			return
		}
		newName, err := validateWorkspaceName(*req.NewName)
		if err != nil {
			badWorkspaceReq(w, err.Error())
			return
		}
		if len(safes) > 0 && !safeInList(newName, safes) {
			writeExternalError(w, http.StatusForbidden, "Forbidden", "Target workspace does not match scoped token workspace")
			return
		}
		if !mergedSet[oldName] {
			writeExternalError(w, http.StatusNotFound, "Not Found", "Workspace not found")
			return
		}
		if newName != oldName && mergedSet[newName] {
			writeExternalError(w, http.StatusConflict, "Conflict", "Target workspace name already exists")
			return
		}
		if newName != oldName {
			replaced := false
			for i, ws := range rec.Workspaces {
				if normSafeName(ws) == oldName {
					rec.Workspaces[i], replaced = newName, true
				}
			}
			if !replaced {
				rec.Workspaces = append(rec.Workspaces, newName)
			}
			for i, aws := range rec.ActiveWorkspaces {
				if normSafeName(aws) == oldName {
					rec.ActiveWorkspaces[i] = newName
				}
			}
			targetName = newName
		}
	} else if !mergedSet[oldName] {
		writeExternalError(w, http.StatusNotFound, "Not Found", "Workspace not found")
		return
	}
	if req.Active != nil {
		if *req.Active {
			rec.ActiveWorkspaces = append(rec.ActiveWorkspaces, targetName)
		} else if filtered := removeWorkspaceFromSlice(rec.ActiveWorkspaces, targetName); len(filtered) > 0 {
			rec.ActiveWorkspaces = filtered
		} else {
			rec.ActiveWorkspaces = []string{"main"}
		}
	}
	if err := h.Store.UpsertUserSettings(r.Context(), rec); err != nil {
		serverWorkspaceErr(w, "Failed to save workspace")
		return
	}
	if targetName != oldName {
		if updatedCount, err = h.Store.RenameWorkspaceInFiles(r.Context(), userID, oldName, targetName); err != nil {
			serverWorkspaceErr(w, "Failed to rename workspace in files")
			return
		}
		if refreshed, err := h.Store.DiscoverFileWorkspaces(r.Context(), userID); err == nil {
			fileCounts = refreshed
		}
	}
	h.broadcastWorkspacesUpdated(userID, rec.Workspaces, rec.ActiveWorkspaces, updatedCount)
	list, active := assembleWorkspaceList(rec, fileCounts, nil)
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{
		"workspace": findWorkspaceItem(list, targetName), "files_updated": updatedCount,
		"workspaces": list, "active_workspaces": active,
	})
}

func (h *ExternalHandler) SetActiveWorkspaces(w http.ResponseWriter, r *http.Request) {
	userID, rec, fileCounts, mergedSet, ok := h.loadWorkspaceState(w, r)
	if !ok {
		return
	}
	safes, folders := extractScopes(r)
	if len(folders) > 0 {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Folder-scoped tokens cannot modify workspaces")
		return
	}
	var req struct {
		ActiveWorkspaces []string `json:"active_workspaces"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.ActiveWorkspaces) == 0 {
		badWorkspaceReq(w, "active_workspaces must be a non-empty array")
		return
	}
	nextActive := make([]string, 0, len(req.ActiveWorkspaces))
	seen := make(map[string]bool, len(req.ActiveWorkspaces))
	for _, raw := range req.ActiveWorkspaces {
		name, err := validateWorkspaceName(raw)
		if err != nil {
			badWorkspaceReq(w, err.Error())
			return
		}
		if len(safes) > 0 && !safeInList(name, safes) {
			writeExternalError(w, http.StatusForbidden, "Forbidden", "Workspace does not match scoped token workspace")
			return
		}
		if !mergedSet[name] {
			badWorkspaceReq(w, "Unknown workspace: "+name)
			return
		}
		if !seen[name] {
			seen[name] = true
			nextActive = append(nextActive, name)
		}
	}
	rec.ActiveWorkspaces = nextActive
	if err := h.Store.UpsertUserSettings(r.Context(), rec); err != nil {
		serverWorkspaceErr(w, "Failed to save active workspaces")
		return
	}
	h.broadcastWorkspacesUpdated(userID, rec.Workspaces, rec.ActiveWorkspaces)
	list, active := assembleWorkspaceList(rec, fileCounts, nil)
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{"workspaces": list, "active_workspaces": active})
}

func (h *ExternalHandler) DeleteWorkspace(w http.ResponseWriter, r *http.Request) {
	userID, rec, fileCounts, mergedSet, ok := h.loadWorkspaceState(w, r)
	if !ok {
		return
	}
	safes, folders := extractScopes(r)
	if len(folders) > 0 {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Folder-scoped tokens cannot delete workspaces")
		return
	}
	name, err := parseWorkspaceURLParam(r)
	if err != nil {
		badWorkspaceReq(w, err.Error())
		return
	}
	if len(safes) > 0 && !safeInList(name, safes) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Workspace does not match scoped token workspace")
		return
	}
	if name == "main" {
		badWorkspaceReq(w, "Cannot delete the default 'main' workspace")
		return
	}
	if !mergedSet[name] {
		writeExternalError(w, http.StatusNotFound, "Not Found", "Workspace not found")
		return
	}
	moveTo := "main"
	if rawMove := r.URL.Query().Get("move_files_to"); strings.TrimSpace(rawMove) != "" {
		if moveTo, err = validateWorkspaceName(rawMove); err != nil {
			badWorkspaceReq(w, err.Error())
			return
		}
		if moveTo == name || !mergedSet[moveTo] {
			badWorkspaceReq(w, "Invalid target workspace for move_files_to")
			return
		}
	}
	if len(safes) > 0 && !safeInList(moveTo, safes) {
		writeExternalError(w, http.StatusForbidden, "Forbidden", "Target workspace does not match scoped token workspace")
		return
	}
	rec.Workspaces = removeWorkspaceFromSlice(rec.Workspaces, name)
	if filtered := removeWorkspaceFromSlice(rec.ActiveWorkspaces, name); len(filtered) > 0 {
		rec.ActiveWorkspaces = filtered
	} else {
		rec.ActiveWorkspaces = []string{"main"}
	}
	if err := h.Store.UpsertUserSettings(r.Context(), rec); err != nil {
		serverWorkspaceErr(w, "Failed to delete workspace")
		return
	}
	reassignedCount, err := h.Store.ReassignWorkspaceInFiles(r.Context(), userID, name, moveTo)
	if err != nil {
		serverWorkspaceErr(w, "Failed to reassign files")
		return
	}
	if refreshed, err := h.Store.DiscoverFileWorkspaces(r.Context(), userID); err == nil {
		fileCounts = refreshed
	}
	h.broadcastWorkspacesUpdated(userID, rec.Workspaces, rec.ActiveWorkspaces)
	list, active := assembleWorkspaceList(rec, fileCounts, nil)
	writeExternalJSON(w, http.StatusOK, map[string]interface{}{
		"success": true, "deleted": name, "moved_files_to": moveTo,
		"files_reassigned": reassignedCount, "workspaces": list, "active_workspaces": active,
	})
}
