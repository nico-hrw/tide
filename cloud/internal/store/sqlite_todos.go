package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nicoh/tide/internal/db"
)

// TodoFilter encapsulates options for querying and filtering todos.
type TodoFilter struct {
	Date        string // matches due_date or scheduled_date
	Priority    string // low, medium, high
	Tag         string // JSON array search
	Description string // substring in title or description
	Search      string // alias for Description
	Overdue     *bool  // is_completed = 0 AND due_date != '' AND due_date < current date
	Status      string // todo, in_progress, completed
	IsCompleted *bool
	Limit       int
	Offset      int
}

func computeIsOverdue(todo *db.Todo, todayStr string) bool {
	if todo.IsCompleted || strings.TrimSpace(todo.DueDate) == "" {
		return false
	}
	dueDate := strings.TrimSpace(todo.DueDate)
	if len(dueDate) >= 10 {
		dueDate = dueDate[:10]
	}
	return dueDate < todayStr
}

// GetTodos retrieves filtered todos for a user.
func (s *SQLiteStore) GetTodos(ctx context.Context, userID string, filter TodoFilter) ([]*db.Todo, error) {
	queryBuilder := strings.Builder{}
	queryBuilder.WriteString(`
		SELECT id, user_id, title, description, status, priority,
		       due_date, scheduled_date, tags, color, is_completed,
		       completed_at, created_at, updated_at
		FROM todos
		WHERE user_id = ?
	`)

	args := []interface{}{userID}

	if filter.Date != "" {
		dateStr := strings.TrimSpace(filter.Date)
		queryBuilder.WriteString(" AND (due_date = ? OR scheduled_date = ? OR due_date LIKE ? OR scheduled_date LIKE ?)")
		args = append(args, dateStr, dateStr, dateStr+"%", dateStr+"%")
	}

	if filter.Priority != "" {
		queryBuilder.WriteString(" AND LOWER(priority) = LOWER(?)")
		args = append(args, strings.TrimSpace(filter.Priority))
	}

	if filter.Tag != "" {
		queryBuilder.WriteString(" AND tags LIKE ?")
		args = append(args, "%\""+strings.TrimSpace(filter.Tag)+"\"%")
	}

	searchQuery := filter.Search
	if searchQuery == "" {
		searchQuery = filter.Description
	}
	if strings.TrimSpace(searchQuery) != "" {
		pattern := "%" + strings.ToLower(strings.TrimSpace(searchQuery)) + "%"
		queryBuilder.WriteString(" AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)")
		args = append(args, pattern, pattern)
	}

	todayStr := time.Now().UTC().Format("2006-01-02")
	if filter.Overdue != nil && *filter.Overdue {
		queryBuilder.WriteString(" AND is_completed = 0 AND due_date != '' AND (due_date < ? OR (length(due_date) >= 10 AND substr(due_date, 1, 10) < ?))")
		args = append(args, todayStr, todayStr)
	}

	if filter.Status != "" {
		queryBuilder.WriteString(" AND LOWER(status) = LOWER(?)")
		args = append(args, strings.TrimSpace(filter.Status))
	}

	if filter.IsCompleted != nil {
		isCompInt := 0
		if *filter.IsCompleted {
			isCompInt = 1
		}
		queryBuilder.WriteString(" AND is_completed = ?")
		args = append(args, isCompInt)
	}

	queryBuilder.WriteString(" ORDER BY CASE WHEN due_date != '' THEN 0 ELSE 1 END, due_date ASC, priority DESC, created_at DESC")

	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	} else if limit > 500 {
		limit = 500
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	queryBuilder.WriteString(" LIMIT ? OFFSET ?")
	args = append(args, limit, offset)

	rows, err := s.readDB().QueryContext(ctx, queryBuilder.String(), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	todos := make([]*db.Todo, 0)
	for rows.Next() {
		var (
			todo        db.Todo
			tagsJSON    string
			isCompInt   int
			completedAt sql.NullTime
		)

		err := rows.Scan(
			&todo.ID,
			&todo.UserID,
			&todo.Title,
			&todo.Description,
			&todo.Status,
			&todo.Priority,
			&todo.DueDate,
			&todo.ScheduledDate,
			&tagsJSON,
			&todo.Color,
			&isCompInt,
			&completedAt,
			&todo.CreatedAt,
			&todo.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		todo.IsCompleted = (isCompInt == 1)
		if completedAt.Valid {
			t := completedAt.Time
			todo.CompletedAt = &t
		}

		if tagsJSON != "" {
			_ = json.Unmarshal([]byte(tagsJSON), &todo.Tags)
		}
		if todo.Tags == nil {
			todo.Tags = []string{}
		}

		todo.IsOverdue = computeIsOverdue(&todo, todayStr)
		todos = append(todos, &todo)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return todos, nil
}

// GetTodoByID fetches a single todo by ID belonging to userID.
func (s *SQLiteStore) GetTodoByID(ctx context.Context, userID, todoID string) (*db.Todo, error) {
	query := `
		SELECT id, user_id, title, description, status, priority,
		       due_date, scheduled_date, tags, color, is_completed,
		       completed_at, created_at, updated_at
		FROM todos
		WHERE id = ? AND user_id = ?
	`
	row := s.readDB().QueryRowContext(ctx, query, todoID, userID)

	var (
		todo        db.Todo
		tagsJSON    string
		isCompInt   int
		completedAt sql.NullTime
	)

	err := row.Scan(
		&todo.ID,
		&todo.UserID,
		&todo.Title,
		&todo.Description,
		&todo.Status,
		&todo.Priority,
		&todo.DueDate,
		&todo.ScheduledDate,
		&tagsJSON,
		&todo.Color,
		&isCompInt,
		&completedAt,
		&todo.CreatedAt,
		&todo.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	todo.IsCompleted = (isCompInt == 1)
	if completedAt.Valid {
		t := completedAt.Time
		todo.CompletedAt = &t
	}

	if tagsJSON != "" {
		_ = json.Unmarshal([]byte(tagsJSON), &todo.Tags)
	}
	if todo.Tags == nil {
		todo.Tags = []string{}
	}

	todayStr := time.Now().UTC().Format("2006-01-02")
	todo.IsOverdue = computeIsOverdue(&todo, todayStr)

	return &todo, nil
}

// CreateTodo inserts a new todo for the given user.
func (s *SQLiteStore) CreateTodo(ctx context.Context, userID string, todo *db.Todo) error {
	if todo.ID == "" {
		todo.ID = uuid.New().String()
	}
	todo.UserID = userID

	if todo.Status == "" {
		todo.Status = "todo"
	}
	if todo.Priority == "" {
		todo.Priority = "medium"
	}
	if todo.Tags == nil {
		todo.Tags = []string{}
	}

	if todo.IsCompleted || todo.Status == "completed" {
		todo.IsCompleted = true
		if todo.CompletedAt == nil {
			now := time.Now().UTC()
			todo.CompletedAt = &now
		}
	}

	now := time.Now().UTC()
	if todo.CreatedAt.IsZero() {
		todo.CreatedAt = now
	}
	if todo.UpdatedAt.IsZero() {
		todo.UpdatedAt = now
	}

	tagsBytes, err := json.Marshal(todo.Tags)
	if err != nil {
		tagsBytes = []byte("[]")
	}

	isCompInt := 0
	if todo.IsCompleted {
		isCompInt = 1
	}

	query := `
		INSERT INTO todos (
			id, user_id, title, description, status, priority,
			due_date, scheduled_date, tags, color, is_completed,
			completed_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err = s.DB.ExecContext(ctx, query,
		todo.ID,
		todo.UserID,
		todo.Title,
		todo.Description,
		todo.Status,
		todo.Priority,
		todo.DueDate,
		todo.ScheduledDate,
		string(tagsBytes),
		todo.Color,
		isCompInt,
		todo.CompletedAt,
		todo.CreatedAt,
		todo.UpdatedAt,
	)
	if err != nil {
		return err
	}

	todayStr := time.Now().UTC().Format("2006-01-02")
	todo.IsOverdue = computeIsOverdue(todo, todayStr)
	return nil
}

// UpdateTodo updates an existing todo record.
func (s *SQLiteStore) UpdateTodo(ctx context.Context, userID string, todo *db.Todo) error {
	todo.UserID = userID
	todo.UpdatedAt = time.Now().UTC()

	if todo.IsCompleted || todo.Status == "completed" {
		todo.IsCompleted = true
		if todo.CompletedAt == nil {
			now := time.Now().UTC()
			todo.CompletedAt = &now
		}
	} else {
		todo.CompletedAt = nil
	}

	if todo.Tags == nil {
		todo.Tags = []string{}
	}
	tagsBytes, err := json.Marshal(todo.Tags)
	if err != nil {
		tagsBytes = []byte("[]")
	}

	isCompInt := 0
	if todo.IsCompleted {
		isCompInt = 1
	}

	query := `
		UPDATE todos SET
			title = ?,
			description = ?,
			status = ?,
			priority = ?,
			due_date = ?,
			scheduled_date = ?,
			tags = ?,
			color = ?,
			is_completed = ?,
			completed_at = ?,
			updated_at = ?
		WHERE id = ? AND user_id = ?
	`

	res, err := s.DB.ExecContext(ctx, query,
		todo.Title,
		todo.Description,
		todo.Status,
		todo.Priority,
		todo.DueDate,
		todo.ScheduledDate,
		string(tagsBytes),
		todo.Color,
		isCompInt,
		todo.CompletedAt,
		todo.UpdatedAt,
		todo.ID,
		todo.UserID,
	)
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

	todayStr := time.Now().UTC().Format("2006-01-02")
	todo.IsOverdue = computeIsOverdue(todo, todayStr)
	return nil
}

// DeleteTodo deletes a todo item by ID.
func (s *SQLiteStore) DeleteTodo(ctx context.Context, userID, todoID string) error {
	query := `DELETE FROM todos WHERE id = ? AND user_id = ?`
	res, err := s.DB.ExecContext(ctx, query, todoID, userID)
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
