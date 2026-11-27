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
	Date            string // matches due_date or scheduled_date
	Priority        string // low, medium, high
	Tag             string // JSON array search
	Description     string // substring in title or description
	Search          string // alias for Description
	Overdue         *bool  // is_completed = 0 AND due_date != '' AND due_date < current date
	Status          string // todo, in_progress, completed
	IsCompleted     *bool
	Folder          string
	IncludeArchived *bool
	Limit           int
	Offset          int
}

const todoSelectColumns = `
	id, user_id, title, description, status, priority,
	due_date, scheduled_date, tags, color, is_completed,
	completed_at,
	COALESCE(folder, ''), COALESCE(linked_note_id, ''),
	COALESCE(recurrence, 'none'), COALESCE(recurrence_rule, ''), COALESCE(recurrence_end, ''),
	COALESCE(completed_dates, '[]'), COALESCE(show_in_calendar, 0), COALESCE(is_archived, 0),
	COALESCE(parent_id, ''), COALESCE(sort_order, 0),
	COALESCE(safe, ''), COALESCE(linked_safes, '[]'),
	COALESCE(is_encrypted, 0), COALESCE(encrypted_payload, ''),
	created_at, updated_at`

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func marshalStringSlice(items []string) ([]string, string) {
	if items == nil {
		items = []string{}
	}
	b, err := json.Marshal(items)
	if err != nil {
		return items, "[]"
	}
	return items, string(b)
}

func unmarshalStringSlice(raw string) []string {
	var out []string
	if raw != "" {
		_ = json.Unmarshal([]byte(raw), &out)
	}
	if out == nil {
		out = []string{}
	}
	return out
}

func scanTodo(scanner interface{ Scan(dest ...interface{}) error }, todayStr string) (*db.Todo, error) {
	var (
		todo               db.Todo
		tagsJSON           string
		completedDatesJSON string
		linkedSafesJSON   string
		isCompInt          int
		showInCalendarInt  int
		isArchivedInt      int
		isEncryptedInt     int
		completedAt        sql.NullTime
	)

	err := scanner.Scan(
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
		&todo.Folder,
		&todo.LinkedNoteID,
		&todo.Recurrence,
		&todo.RecurrenceRule,
		&todo.RecurrenceEnd,
		&completedDatesJSON,
		&showInCalendarInt,
		&isArchivedInt,
		&todo.ParentID,
		&todo.SortOrder,
		&todo.Safe,
		&linkedSafesJSON,
		&isEncryptedInt,
		&todo.EncryptedPayload,
		&todo.CreatedAt,
		&todo.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	todo.IsCompleted = (isCompInt == 1)
	todo.ShowInCalendar = (showInCalendarInt == 1)
	todo.IsArchived = (isArchivedInt == 1)
	todo.IsEncrypted = (isEncryptedInt == 1)
	if completedAt.Valid {
		t := completedAt.Time
		todo.CompletedAt = &t
	}

	todo.Tags = unmarshalStringSlice(tagsJSON)
	todo.CompletedDates = unmarshalStringSlice(completedDatesJSON)
	todo.LinkedSafes = unmarshalStringSlice(linkedSafesJSON)
	todo.IsOverdue = computeIsOverdue(&todo, todayStr)

	return &todo, nil
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
	queryBuilder.WriteString("SELECT ")
	queryBuilder.WriteString(todoSelectColumns)
	queryBuilder.WriteString("\n\t\tFROM todos\n\t\tWHERE user_id = ?\n\t")

	args := []interface{}{userID}

	if filter.Date != "" {
		dateStr := strings.TrimSpace(filter.Date)
		dateLike := escapeLike(dateStr) + "%"
		queryBuilder.WriteString(` AND (due_date = ? OR scheduled_date = ? OR due_date LIKE ? ESCAPE '\' OR scheduled_date LIKE ? ESCAPE '\')`)
		args = append(args, dateStr, dateStr, dateLike, dateLike)
	}

	if filter.Priority != "" {
		queryBuilder.WriteString(" AND LOWER(priority) = LOWER(?)")
		args = append(args, strings.TrimSpace(filter.Priority))
	}

	if filter.Tag != "" {
		queryBuilder.WriteString(` AND tags LIKE ? ESCAPE '\'`)
		args = append(args, `%"`+escapeLike(strings.TrimSpace(filter.Tag))+`"%`)
	}

	searchQuery := filter.Search
	if searchQuery == "" {
		searchQuery = filter.Description
	}
	if strings.TrimSpace(searchQuery) != "" {
		pattern := "%" + escapeLike(strings.ToLower(strings.TrimSpace(searchQuery))) + "%"
		queryBuilder.WriteString(` AND (LOWER(title) LIKE ? ESCAPE '\' OR LOWER(description) LIKE ? ESCAPE '\')`)
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
		queryBuilder.WriteString(" AND is_completed = ?")
		args = append(args, boolToInt(*filter.IsCompleted))
	}

	if filter.Folder != "" {
		queryBuilder.WriteString(" AND folder = ?")
		args = append(args, filter.Folder)
	}

	if filter.IncludeArchived != nil && !*filter.IncludeArchived {
		queryBuilder.WriteString(" AND COALESCE(is_archived, 0) = 0")
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
		todo, err := scanTodo(rows, todayStr)
		if err != nil {
			return nil, err
		}
		todos = append(todos, todo)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	return todos, nil
}

// GetTodoByID fetches a single todo by ID belonging to userID.
func (s *SQLiteStore) GetTodoByID(ctx context.Context, userID, todoID string) (*db.Todo, error) {
	query := "SELECT " + todoSelectColumns + "\n\t\tFROM todos\n\t\tWHERE id = ? AND user_id = ?\n\t"
	row := s.readDB().QueryRowContext(ctx, query, todoID, userID)

	todayStr := time.Now().UTC().Format("2006-01-02")
	todo, err := scanTodo(row, todayStr)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	return todo, nil
}

// sanitizeEncryptedTodo blanks all plaintext columns on an encrypted todo so zero
// user content is stored outside encrypted_payload.
func sanitizeEncryptedTodo(todo *db.Todo) {
	if !todo.IsEncrypted {
		return
	}
	todo.Title = ""
	todo.Description = ""
	todo.Status = "todo"
	todo.Priority = "medium"
	todo.DueDate = ""
	todo.ScheduledDate = ""
	todo.Tags = []string{}
	todo.Color = ""
	todo.IsCompleted = false
	todo.CompletedAt = nil
	todo.Folder = ""
	todo.LinkedNoteID = ""
	todo.Recurrence = "none"
	todo.RecurrenceRule = ""
	todo.RecurrenceEnd = ""
	todo.CompletedDates = []string{}
	todo.ShowInCalendar = false
	todo.IsArchived = false
	todo.ParentID = ""
	todo.SortOrder = 0
	todo.Safe = ""
	todo.LinkedSafes = []string{}
	todo.IsOverdue = false
}

// CreateTodo inserts a new todo for the given user.
func (s *SQLiteStore) CreateTodo(ctx context.Context, userID string, todo *db.Todo) error {
	if todo.ID == "" {
		todo.ID = uuid.New().String()
	}
	todo.UserID = userID

	if todo.IsEncrypted {
		sanitizeEncryptedTodo(todo)
	} else {
		todo.EncryptedPayload = ""
		if todo.Status == "" {
			todo.Status = "todo"
		}
		if todo.Priority == "" {
			todo.Priority = "medium"
		}
		if todo.Recurrence == "" {
			todo.Recurrence = "none"
		}
		if todo.IsCompleted || todo.Status == "completed" {
			todo.IsCompleted = true
			if todo.CompletedAt == nil {
				now := time.Now().UTC()
				todo.CompletedAt = &now
			}
		}
	}

	var tagsJSON, completedDatesJSON, linkedSafesJSON string
	todo.Tags, tagsJSON = marshalStringSlice(todo.Tags)
	todo.CompletedDates, completedDatesJSON = marshalStringSlice(todo.CompletedDates)
	todo.LinkedSafes, linkedSafesJSON = marshalStringSlice(todo.LinkedSafes)

	now := time.Now().UTC()
	if todo.CreatedAt.IsZero() {
		todo.CreatedAt = now
	}
	if todo.UpdatedAt.IsZero() {
		todo.UpdatedAt = now
	}

	query := `
		INSERT INTO todos (
			id, user_id, title, description, status, priority,
			due_date, scheduled_date, tags, color, is_completed,
			completed_at, folder, linked_note_id, recurrence,
			recurrence_rule, recurrence_end, completed_dates,
			show_in_calendar, is_archived, parent_id, sort_order, safe, linked_safes,
			is_encrypted, encrypted_payload,
			created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := s.DB.ExecContext(ctx, query,
		todo.ID,
		todo.UserID,
		todo.Title,
		todo.Description,
		todo.Status,
		todo.Priority,
		todo.DueDate,
		todo.ScheduledDate,
		tagsJSON,
		todo.Color,
		boolToInt(todo.IsCompleted),
		todo.CompletedAt,
		todo.Folder,
		todo.LinkedNoteID,
		todo.Recurrence,
		todo.RecurrenceRule,
		todo.RecurrenceEnd,
		completedDatesJSON,
		boolToInt(todo.ShowInCalendar),
		boolToInt(todo.IsArchived),
		todo.ParentID,
		todo.SortOrder,
		todo.Safe,
		linkedSafesJSON,
		boolToInt(todo.IsEncrypted),
		todo.EncryptedPayload,
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

	if todo.IsEncrypted {
		sanitizeEncryptedTodo(todo)
	} else {
		todo.EncryptedPayload = ""
		if todo.IsCompleted || todo.Status == "completed" {
			todo.IsCompleted = true
			if todo.CompletedAt == nil {
				now := time.Now().UTC()
				todo.CompletedAt = &now
			}
		} else {
			todo.CompletedAt = nil
		}

		if todo.Recurrence == "" {
			todo.Recurrence = "none"
		}
	}

	var tagsJSON, completedDatesJSON, linkedSafesJSON string
	todo.Tags, tagsJSON = marshalStringSlice(todo.Tags)
	todo.CompletedDates, completedDatesJSON = marshalStringSlice(todo.CompletedDates)
	todo.LinkedSafes, linkedSafesJSON = marshalStringSlice(todo.LinkedSafes)

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
			folder = ?,
			linked_note_id = ?,
			recurrence = ?,
			recurrence_rule = ?,
			recurrence_end = ?,
			completed_dates = ?,
			show_in_calendar = ?,
			is_archived = ?,
			parent_id = ?,
			sort_order = ?,
			safe = ?,
			linked_safes = ?,
			is_encrypted = ?,
			encrypted_payload = ?,
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
		tagsJSON,
		todo.Color,
		boolToInt(todo.IsCompleted),
		todo.CompletedAt,
		todo.Folder,
		todo.LinkedNoteID,
		todo.Recurrence,
		todo.RecurrenceRule,
		todo.RecurrenceEnd,
		completedDatesJSON,
		boolToInt(todo.ShowInCalendar),
		boolToInt(todo.IsArchived),
		todo.ParentID,
		todo.SortOrder,
		todo.Safe,
		linkedSafesJSON,
		boolToInt(todo.IsEncrypted),
		todo.EncryptedPayload,
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
