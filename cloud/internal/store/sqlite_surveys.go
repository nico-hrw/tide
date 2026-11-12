package store

import (
	"context"
	"database/sql"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
)

var (
	surveyTableInitLock sync.Mutex
	surveyTableCreated  = make(map[*sql.DB]bool)
)

func (s *SQLiteStore) ensureSurveyResponsesTable(ctx context.Context) error {
	surveyTableInitLock.Lock()
	defer surveyTableInitLock.Unlock()

	if surveyTableCreated[s.DB] {
		return nil
	}

	query := `
	CREATE TABLE IF NOT EXISTS survey_responses (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		survey_id TEXT NOT NULL,
		data TEXT NOT NULL DEFAULT '{}',
		created_at DATETIME NOT NULL,
		updated_at DATETIME NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);
	CREATE INDEX IF NOT EXISTS idx_survey_responses_user_survey ON survey_responses(user_id, survey_id);
	`
	if _, err := s.DB.ExecContext(ctx, query); err != nil {
		return err
	}
	surveyTableCreated[s.DB] = true
	return nil
}

// GetSurveyResponses retrieves survey responses for a user, optionally filtered by surveyID.
func (s *SQLiteStore) GetSurveyResponses(ctx context.Context, userID, surveyID string) ([]*db.SurveyResponse, error) {
	if err := s.ensureSurveyResponsesTable(ctx); err != nil {
		return nil, err
	}

	var (
		query string
		args  []interface{}
	)

	if surveyID != "" {
		query = `
			SELECT id, user_id, survey_id, data, created_at, updated_at
			FROM survey_responses
			WHERE user_id = ? AND survey_id = ?
			ORDER BY created_at DESC
		`
		args = []interface{}{userID, surveyID}
	} else {
		query = `
			SELECT id, user_id, survey_id, data, created_at, updated_at
			FROM survey_responses
			WHERE user_id = ?
			ORDER BY created_at DESC
		`
		args = []interface{}{userID}
	}

	rows, err := s.readDB().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	responses := make([]*db.SurveyResponse, 0)
	for rows.Next() {
		var resp db.SurveyResponse
		if err := rows.Scan(
			&resp.ID,
			&resp.UserID,
			&resp.SurveyID,
			&resp.Data,
			&resp.CreatedAt,
			&resp.UpdatedAt,
		); err != nil {
			return nil, err
		}
		responses = append(responses, &resp)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return responses, nil
}

// CreateSurveyResponse inserts a new survey response.
func (s *SQLiteStore) CreateSurveyResponse(ctx context.Context, resp *db.SurveyResponse) error {
	if err := s.ensureSurveyResponsesTable(ctx); err != nil {
		return err
	}

	if resp.ID == "" {
		resp.ID = uuid.New().String()
	}

	now := time.Now().UTC()
	if resp.CreatedAt.IsZero() {
		resp.CreatedAt = now
	}
	if resp.UpdatedAt.IsZero() {
		resp.UpdatedAt = now
	}

	query := `
		INSERT INTO survey_responses (
			id, user_id, survey_id, data, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?)
	`

	_, err := s.DB.ExecContext(ctx, query,
		resp.ID,
		resp.UserID,
		resp.SurveyID,
		resp.Data,
		resp.CreatedAt,
		resp.UpdatedAt,
	)
	return err
}

// DeleteSurveyResponse deletes a survey response by ID belonging to userID.
func (s *SQLiteStore) DeleteSurveyResponse(ctx context.Context, userID, id string) error {
	if err := s.ensureSurveyResponsesTable(ctx); err != nil {
		return err
	}

	query := `DELETE FROM survey_responses WHERE id = ? AND user_id = ?`
	res, err := s.DB.ExecContext(ctx, query, id, userID)
	if err != nil {
		return err
	}

	affected, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}
