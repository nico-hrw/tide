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

// ParseNoteTitle extracts title from metadata or public_meta.
func ParseNoteTitle(metadataStr, publicMetaStr string) string {
	var meta struct {
		Title string `json:"title"`
	}
	if metadataStr != "" && metadataStr != "{}" {
		_ = json.Unmarshal([]byte(metadataStr), &meta)
	}
	if meta.Title != "" {
		return meta.Title
	}

	var pub struct {
		Title string `json:"title"`
	}
	if publicMetaStr != "" && publicMetaStr != "{}" {
		_ = json.Unmarshal([]byte(publicMetaStr), &pub)
	}
	if pub.Title != "" {
		return pub.Title
	}

	return "Untitled Note"
}

// ListNotesForExternalAPI returns the list of active notes for the external API.
func (s *SQLiteStore) ListNotesForExternalAPI(ctx context.Context, userID string, search string, limit int) ([]*db.ExternalNoteListItem, error) {
	query := `
		SELECT f.id, f.parent_id, f.updated_at,
		       COALESCE(f.visibility, 'private') as visibility,
		       COALESCE(f.version, 1) as version,
		       COALESCE(NULLIF(f.metadata, ''), '{}') as metadata,
		       COALESCE(NULLIF(f.public_meta, ''), '{}') as public_meta,
		       CASE WHEN f.secured_meta IS NOT NULL AND LENGTH(f.secured_meta) > 0 THEN 1 ELSE 0 END AS has_secured_meta
		FROM files f
		LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
		WHERE (f.owner_id = ? OR (fs.user_id = ? AND fs.status = 'accepted'))
		  AND f.type = 'note'
		  AND json_extract(COALESCE(NULLIF(f.metadata, ''), '{}'), '$.deleted_at') IS NULL
		ORDER BY f.updated_at DESC
	`
	rows, err := s.readDB().QueryContext(ctx, query, userID, userID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	searchLower := strings.ToLower(strings.TrimSpace(search))
	var notes []*db.ExternalNoteListItem

	for rows.Next() {
		var id string
		var parentID *string
		var updatedAt time.Time
		var visibility string
		var version int
		var md, pm string
		var hasSecuredMeta int

		if err := rows.Scan(&id, &parentID, &updatedAt, &visibility, &version, &md, &pm, &hasSecuredMeta); err != nil {
			return nil, err
		}

		title := ParseNoteTitle(md, pm)
		if searchLower != "" {
			if !strings.Contains(strings.ToLower(title), searchLower) {
				continue
			}
		}

		var meta struct {
			Safe              string   `json:"safe"`
			LinkedSafes       []string `json:"linkedSafes"`
			TagIDs            []string `json:"tagIds"`
			Icon              string   `json:"icon"`
			Color             string   `json:"color"`
			Unencrypted       bool     `json:"unencrypted"`
			HasCustomPassword bool     `json:"has_custom_password"`
		}
		if md != "" && md != "{}" {
			_ = json.Unmarshal([]byte(md), &meta)
		}

		safe := meta.Safe
		if safe == "" || safe == "Standard" {
			safe = "main"
		}

		notes = append(notes, &db.ExternalNoteListItem{
			ID:          id,
			Title:       title,
			ParentID:    parentID,
			Safe:        safe,
			LinkedSafes: meta.LinkedSafes,
			TagIDs:      meta.TagIDs,
			Icon:        meta.Icon,
			Color:       meta.Color,
			Encrypted:   hasSecuredMeta == 1 || meta.HasCustomPassword || !(visibility == "public" || meta.Unencrypted),
			Version:     version,
			UpdatedAt:   updatedAt,
		})
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	if notes == nil {
		notes = []*db.ExternalNoteListItem{}
	}

	if limit > 0 && len(notes) > limit {
		notes = notes[:limit]
	}

	return notes, nil
}

// GetNoteForExternalAPI retrieves a single note's metadata and content.
func (s *SQLiteStore) GetNoteForExternalAPI(ctx context.Context, userID, noteID string) (*db.ExternalNote, error) {
	query := `
		SELECT f.id, f.parent_id, f.created_at, f.updated_at,
		       COALESCE(NULLIF(f.metadata, ''), '{}') as metadata,
		       COALESCE(NULLIF(f.public_meta, ''), '{}') as public_meta,
		       f.content
		FROM files f
		LEFT JOIN file_shares fs ON f.id = fs.file_id AND fs.user_id = ?
		WHERE f.id = ?
		  AND (f.owner_id = ? OR (fs.user_id = ? AND fs.status = 'accepted'))
		  AND f.type = 'note'
		  AND json_extract(COALESCE(NULLIF(f.metadata, ''), '{}'), '$.deleted_at') IS NULL
	`
	row := s.readDB().QueryRowContext(ctx, query, userID, noteID, userID, userID)

	var id string
	var parentID *string
	var createdAt, updatedAt time.Time
	var md, pm string
	var content []byte

	if err := row.Scan(&id, &parentID, &createdAt, &updatedAt, &md, &pm, &content); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	title := ParseNoteTitle(md, pm)
	contentStr := string(content)

	return &db.ExternalNote{
		ID:        id,
		Title:     title,
		Content:   contentStr,
		ParentID:  parentID,
		CreatedAt: createdAt,
		UpdatedAt: updatedAt,
	}, nil
}
