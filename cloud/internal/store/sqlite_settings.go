package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/nicoh/tide/internal/db"
)

func normalizeWorkspaceName(name string, emptyToMain bool) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		if emptyToMain {
			return "main"
		}
		return ""
	}
	if trimmed == "Standard" {
		return "main"
	}
	return trimmed
}

func normalizeWorkspaceList(list []string, ensureMain bool) []string {
	out := make([]string, 0, len(list)+1)
	seen := make(map[string]bool, len(list)+1)
	for _, item := range list {
		norm := normalizeWorkspaceName(item, false)
		if norm == "" || seen[norm] {
			continue
		}
		seen[norm] = true
		out = append(out, norm)
	}
	if ensureMain && !seen["main"] {
		out = append([]string{"main"}, out...)
	}
	return out
}

func normalizeSettingsRecord(rec *db.UserSettingsRecord) ([]string, []string, map[string]interface{}) {
	workspaces := normalizeWorkspaceList(rec.Workspaces, true)
	active := normalizeWorkspaceList(rec.ActiveWorkspaces, false)
	if len(active) == 0 {
		active = []string{"main"}
	}
	prefs := rec.Preferences
	if prefs == nil {
		prefs = map[string]interface{}{}
	}
	return workspaces, active, prefs
}

// GetUserSettings retrieves user workspace and preference settings, returning defaults if not found.
func (s *SQLiteStore) GetUserSettings(ctx context.Context, userID string) (*db.UserSettingsRecord, error) {
	const query = `SELECT workspaces, active_workspaces, preferences, updated_at FROM user_settings WHERE user_id = ?`
	var workspacesJSON, activeJSON, prefsJSON string
	var updatedAt sql.NullTime
	if err := s.readDB().QueryRowContext(ctx, query, userID).Scan(&workspacesJSON, &activeJSON, &prefsJSON, &updatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &db.UserSettingsRecord{
				UserID:           userID,
				Workspaces:       []string{"main", "Archiv"},
				ActiveWorkspaces: []string{"main"},
				Preferences:      map[string]interface{}{},
			}, nil
		}
		return nil, err
	}

	var workspaces, activeWorkspaces []string
	var prefs map[string]interface{}
	if workspacesJSON != "" {
		_ = json.Unmarshal([]byte(workspacesJSON), &workspaces)
	}
	if activeJSON != "" {
		_ = json.Unmarshal([]byte(activeJSON), &activeWorkspaces)
	}
	if prefsJSON != "" {
		_ = json.Unmarshal([]byte(prefsJSON), &prefs)
	}

	normWS, normActive, normPrefs := normalizeSettingsRecord(&db.UserSettingsRecord{Workspaces: workspaces, ActiveWorkspaces: activeWorkspaces, Preferences: prefs})
	rec := &db.UserSettingsRecord{UserID: userID, Workspaces: normWS, ActiveWorkspaces: normActive, Preferences: normPrefs}
	if updatedAt.Valid {
		rec.UpdatedAt = updatedAt.Time
	}
	return rec, nil
}

// UpsertUserSettings inserts or updates a user's workspace and preference settings.
func (s *SQLiteStore) UpsertUserSettings(ctx context.Context, rec *db.UserSettingsRecord) error {
	if rec == nil {
		return errors.New("user settings record is nil")
	}
	workspaces, activeWorkspaces, prefs := normalizeSettingsRecord(rec)
	now := time.Now().UTC()
	rec.Workspaces, rec.ActiveWorkspaces, rec.Preferences, rec.UpdatedAt = workspaces, activeWorkspaces, prefs, now

	wsJSON, err := json.Marshal(workspaces)
	if err != nil {
		return err
	}
	activeJSON, err := json.Marshal(activeWorkspaces)
	if err != nil {
		return err
	}
	prefsJSON, err := json.Marshal(prefs)
	if err != nil {
		return err
	}

	const query = `
		INSERT INTO user_settings (user_id, workspaces, active_workspaces, preferences, updated_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(user_id) DO UPDATE SET workspaces=excluded.workspaces, active_workspaces=excluded.active_workspaces, preferences=excluded.preferences, updated_at=excluded.updated_at`
	_, err = s.DB.ExecContext(ctx, query, rec.UserID, string(wsJSON), string(activeJSON), string(prefsJSON), now)
	return err
}

// DiscoverFileWorkspaces scans non-deleted, non-group owned files to count files per workspace.
func (s *SQLiteStore) DiscoverFileWorkspaces(ctx context.Context, userID string) (map[string]int, error) {
	const query = `
		SELECT COALESCE(metadata, '') FROM files
		WHERE owner_id = ? AND type IN ('note', 'folder', 'canvas')
		  AND json_extract(COALESCE(NULLIF(metadata,''),'{}'), '$.deleted_at') IS NULL
		  AND COALESCE(json_extract(COALESCE(NULLIF(public_meta,''),'{}'), '$.isGroup'), 0) != 1
		  AND COALESCE(json_extract(COALESCE(NULLIF(metadata,''),'{}'), '$.isGroup'), 0) != 1`
	rows, err := s.readDB().QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int)
	for rows.Next() {
		var metaStr string
		if err := rows.Scan(&metaStr); err != nil {
			return nil, err
		}
		var meta struct {
			Safe        string   `json:"safe"`
			LinkedSafes []string `json:"linkedSafes"`
		}
		if metaStr != "" && metaStr != "{}" {
			_ = json.Unmarshal([]byte(metaStr), &meta)
		}
		primary := normalizeWorkspaceName(meta.Safe, true)
		seenInFile := map[string]bool{primary: true}
		counts[primary]++
		for _, linked := range meta.LinkedSafes {
			ws := normalizeWorkspaceName(linked, false)
			if ws == "" || seenInFile[ws] {
				continue
			}
			seenInFile[ws] = true
			counts[ws]++
		}
	}
	return counts, rows.Err()
}

type fileMetadataRow struct {
	id   string
	meta string
}

func updateWorkspaceInFileMeta(meta map[string]interface{}, oldName, targetName string, removeFromLinked bool) bool {
	changed := false
	if safeVal, ok := meta["safe"].(string); ok && safeVal == oldName {
		meta["safe"] = targetName
		changed = true
	}
	if rawLinked, ok := meta["linkedSafes"].([]interface{}); ok {
		hasOld := false
		out := make([]string, 0, len(rawLinked))
		seen := make(map[string]bool, len(rawLinked))
		for _, item := range rawLinked {
			sVal, ok := item.(string)
			if !ok || sVal == "" {
				continue
			}
			if sVal == oldName {
				hasOld = true
				if removeFromLinked {
					continue
				}
				sVal = targetName
			}
			if !seen[sVal] {
				seen[sVal] = true
				out = append(out, sVal)
			}
		}
		if hasOld {
			meta["linkedSafes"] = out
			changed = true
		}
	}
	return changed
}

func (s *SQLiteStore) transformOwnedFilesMetadata(ctx context.Context, userID string, transform func(meta map[string]interface{}) bool) (int64, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	const selectQuery = `
		SELECT id, COALESCE(metadata, '') FROM files
		WHERE owner_id = ? AND json_extract(COALESCE(NULLIF(metadata,''),'{}'), '$.deleted_at') IS NULL`
	rows, err := tx.QueryContext(ctx, selectQuery, userID)
	if err != nil {
		return 0, err
	}
	var candidates []fileMetadataRow
	for rows.Next() {
		var r fileMetadataRow
		if err := rows.Scan(&r.id, &r.meta); err != nil {
			rows.Close()
			return 0, err
		}
		candidates = append(candidates, r)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return 0, err
	}
	rows.Close()

	const updateQuery = `UPDATE files SET metadata = ?, version = CASE WHEN version < 2 THEN 2 ELSE version + 1 END, updated_at = ? WHERE id = ? AND owner_id = ?`
	now := time.Now().UTC()
	var updatedCount int64
	for _, c := range candidates {
		if c.meta == "" || c.meta == "{}" {
			continue
		}
		var meta map[string]interface{}
		if err := json.Unmarshal([]byte(c.meta), &meta); err != nil || meta == nil {
			continue
		}
		if !transform(meta) {
			continue
		}
		encoded, err := json.Marshal(meta)
		if err != nil {
			return 0, err
		}
		if _, err := tx.ExecContext(ctx, updateQuery, string(encoded), now, c.id, userID); err != nil {
			return 0, err
		}
		updatedCount++
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return updatedCount, nil
}

// RenameWorkspaceInFiles updates metadata.safe and metadata.linkedSafes from oldName to newName in owned files.
func (s *SQLiteStore) RenameWorkspaceInFiles(ctx context.Context, userID, oldName, newName string) (int64, error) {
	if oldName == "" || newName == "" || oldName == newName {
		return 0, nil
	}
	return s.transformOwnedFilesMetadata(ctx, userID, func(meta map[string]interface{}) bool {
		return updateWorkspaceInFileMeta(meta, oldName, newName, false)
	})
}

// ReassignWorkspaceInFiles replaces metadata.safe == oldName with targetName and removes oldName from linkedSafes.
func (s *SQLiteStore) ReassignWorkspaceInFiles(ctx context.Context, userID, oldName, targetName string) (int64, error) {
	if oldName == "" {
		return 0, nil
	}
	if strings.TrimSpace(targetName) == "" {
		targetName = "main"
	}
	return s.transformOwnedFilesMetadata(ctx, userID, func(meta map[string]interface{}) bool {
		return updateWorkspaceInFileMeta(meta, oldName, targetName, true)
	})
}

// ListFoldersForExternalAPI returns accessible non-deleted folders, with optional tag/group, search, and limit filters.
func (s *SQLiteStore) ListFoldersForExternalAPI(ctx context.Context, userID string, includeTags bool, onlyTags bool, search string, limit int) ([]*db.File, error) {
	var qb strings.Builder
	qb.WriteString(`
		SELECT f.id, f.owner_id, f.parent_id, f.type,
		       COALESCE(f.visibility, 'private'), COALESCE(NULLIF(f.public_meta, ''), '{}'),
		       COALESCE(fs.secured_meta, f.secured_meta, x''), COALESCE(f.version, 1),
		       COALESCE(NULLIF(f.metadata, ''), '{}'), f.created_at, f.updated_at,
		       CASE
		           WHEN f.owner_id = ? THEN 'owner'
		           WHEN fs.status = 'accepted' AND fs.permission IS NOT NULL AND fs.permission != '' THEN fs.permission
		           ELSE 'view'
		       END as permission
		FROM files f
		LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
		WHERE (f.owner_id = ? OR (fs.user_id = ? AND fs.status = 'accepted'))
		  AND f.type = 'folder'
		  AND json_extract(COALESCE(NULLIF(f.metadata, ''), '{}'), '$.deleted_at') IS NULL`)

	if onlyTags {
		qb.WriteString(` AND (COALESCE(json_extract(COALESCE(NULLIF(f.public_meta,''),'{}'), '$.isGroup'), 0) = 1 OR COALESCE(json_extract(COALESCE(NULLIF(f.metadata,''),'{}'), '$.isGroup'), 0) = 1)`)
	} else if !includeTags {
		qb.WriteString(` AND COALESCE(json_extract(COALESCE(NULLIF(f.public_meta,''),'{}'), '$.isGroup'), 0) != 1 AND COALESCE(json_extract(COALESCE(NULLIF(f.metadata,''),'{}'), '$.isGroup'), 0) != 1`)
	}
	qb.WriteString(` ORDER BY f.updated_at DESC, f.created_at DESC, f.id ASC`)

	rows, err := s.readDB().QueryContext(ctx, qb.String(), userID, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	searchLower := strings.ToLower(strings.TrimSpace(search))
	folders := make([]*db.File, 0)
	for rows.Next() {
		var f db.File
		var publicMetaStr, metaStr string
		if err := rows.Scan(
			&f.ID, &f.OwnerID, &f.ParentID, &f.Type,
			&f.Visibility, &publicMetaStr, &f.SecuredMeta, &f.Version,
			&metaStr, &f.CreatedAt, &f.UpdatedAt, &f.Permission,
		); err != nil {
			return nil, err
		}
		if searchLower != "" && !strings.Contains(strings.ToLower(ParseNoteTitle(metaStr, publicMetaStr)), searchLower) {
			continue
		}
		f.PublicMeta = json.RawMessage(publicMetaStr)
		f.Metadata = json.RawMessage(metaStr)
		folders = append(folders, &f)
		if limit > 0 && len(folders) >= limit {
			break
		}
	}
	return folders, rows.Err()
}
