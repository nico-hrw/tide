package db

import (
	"context"
	"encoding/json"
	"time"
)

// User represents the users table.
type User struct {
	ID string `json:"id" db:"id"` // UUID

	// Blind Indexes (Hashes) for Lookup
	EmailHash    *string `json:"-" db:"email_blind_index"`
	UsernameHash *string `json:"-" db:"username_blind_index"`
	PhoneHash    *string `json:"-" db:"phone_blind_index"`

	// Zero-Knowledge Encrypted Values
	EncryptedVault  []byte `json:"encrypted_vault" db:"encrypted_vault"`
	EncryptedPepper []byte `json:"encrypted_pepper" db:"encrypted_pepper"`

	// Legacy/Direct Access (May be mapped from API tokens rather than DB directly)
	Email    string `json:"email,omitempty" db:"-"`
	Username string `json:"username,omitempty" db:"-"`
	Phone    string `json:"phone,omitempty" db:"-"`

	PublicKey string `json:"public_key" db:"public_key"` // Public known

	// PIN fields
	PinHash   *string `json:"-" db:"pin_hash"`
	LoginCode *string `json:"-" db:"login_code"`

	EnabledExtensions json.RawMessage `json:"enabled_extensions" db:"enabled_extensions"`

	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

// FileType enum for File.Type
type FileType string

const (
	FileTypeFile   FileType = "file"
	FileTypeFolder FileType = "folder"
	FileTypeNote   FileType = "note"
	FileTypeEvent  FileType = "event"
)

// File represents the files table.
type File struct {
	ID          string          `json:"id" db:"id"`                         // UUID
	OwnerID     string          `json:"owner_id" db:"owner_id"`             // UUID
	ParentID    *string         `json:"parent_id,omitempty" db:"parent_id"` // UUID, nullable
	Type        FileType        `json:"type" db:"type"`
	MIMEType    *string         `json:"mime_type,omitempty" db:"mime_type"`
	Size        int64           `json:"size" db:"size"`
	CreatedAt   time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at" db:"updated_at"`
	BlobPath    *string         `json:"blob_path,omitempty" db:"blob_path"`
	Visibility  string          `json:"visibility" db:"visibility"`     // 'private' or 'public'
	PublicMeta  json.RawMessage `json:"public_meta" db:"public_meta"`   // JSONB
	SecuredMeta []byte          `json:"secured_meta" db:"secured_meta"` // BYTEA
	ShareStatus    string          `json:"share_status,omitempty" db:"share_status"`
	IsTask         bool            `json:"is_task" db:"is_task"`
	IsCompleted    bool            `json:"is_completed" db:"is_completed"`
	Exdates        json.RawMessage `json:"exdates" db:"exdates"`
	CompletedDates json.RawMessage `json:"completed_dates" db:"completed_dates"`
}

// Task represents the tasks table for E2EE tasks
type Task struct {
	ID             string    `json:"id" db:"id"`
	UserID         string    `json:"user_id" db:"user_id"`
	EncryptedVault []byte    `json:"encrypted_vault" db:"encrypted_vault"`
	CreatedAt      time.Time `json:"created_at" db:"created_at"`
	UpdatedAt      time.Time `json:"updated_at" db:"updated_at"`
}


// DB defines the interface for database operations.
type DB interface {
	CreateUser(ctx context.Context, user *User) error
	GetUser(ctx context.Context, id string) (*User, error)
	// Add other methods as needed
}
