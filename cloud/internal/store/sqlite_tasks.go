package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/nicoh/tide/internal/db"
)

func (s *SQLiteStore) CreateTask(ctx context.Context, task *db.Task) error {
	query := `
		INSERT INTO tasks (id, user_id, encrypted_vault, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?)
	`
	_, err := s.DB.ExecContext(ctx, query,
		task.ID,
		task.UserID,
		task.EncryptedVault,
		task.CreatedAt,
		task.UpdatedAt,
	)
	return err
}

func (s *SQLiteStore) GetTask(ctx context.Context, id, userID string) (*db.Task, error) {
	query := `SELECT id, user_id, encrypted_vault, created_at, updated_at FROM tasks WHERE id = ? AND user_id = ?`
	row := s.DB.QueryRowContext(ctx, query, id, userID)

	var task db.Task
	err := row.Scan(
		&task.ID,
		&task.UserID,
		&task.EncryptedVault,
		&task.CreatedAt,
		&task.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &task, nil
}

func (s *SQLiteStore) ListTasks(ctx context.Context, userID string) ([]*db.Task, error) {
	query := `SELECT id, user_id, encrypted_vault, created_at, updated_at FROM tasks WHERE user_id = ?`
	rows, err := s.DB.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []*db.Task
	for rows.Next() {
		var task db.Task
		if err := rows.Scan(
			&task.ID,
			&task.UserID,
			&task.EncryptedVault,
			&task.CreatedAt,
			&task.UpdatedAt,
		); err != nil {
			return nil, err
		}
		tasks = append(tasks, &task)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tasks, nil
}

func (s *SQLiteStore) UpdateTask(ctx context.Context, task *db.Task) error {
	query := `UPDATE tasks SET encrypted_vault = ?, updated_at = ? WHERE id = ? AND user_id = ?`
	res, err := s.DB.ExecContext(ctx, query,
		task.EncryptedVault,
		task.UpdatedAt,
		task.ID,
		task.UserID,
	)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *SQLiteStore) DeleteTask(ctx context.Context, id, userID string) error {
	query := `DELETE FROM tasks WHERE id = ? AND user_id = ?`
	res, err := s.DB.ExecContext(ctx, query, id, userID)
	if err != nil {
		return err
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return ErrNotFound
	}
	return nil
}
