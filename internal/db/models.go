package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// User represents the users table.
type User struct {
	ID            string    `json:"id" db:"id"`                         // UUID
	Email         string    `json:"email" db:"email"`
	PublicKey     string    `json:"public_key" db:"public_key"`
	EncPrivateKey string    `json:"enc_private_key" db:"enc_private_key"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
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
	ID          string          `json:"id" db:"id"`               // UUID
	OwnerID     string          `json:"owner_id" db:"owner_id"`   // UUID
	ParentID    *string         `json:"parent_id,omitempty" db:"parent_id"` // UUID, nullable
	Type        FileType        `json:"type" db:"type"`
	MIMEType    *string         `json:"mime_type,omitempty" db:"mime_type"`
	Size        int64           `json:"size" db:"size"`
	CreatedAt   time.Time       `json:"created_at" db:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at" db:"updated_at"`
	BlobPath    *string         `json:"blob_path,omitempty" db:"blob_path"`
	PublicMeta  json.RawMessage `json:"public_meta" db:"public_meta"` // JSONB
	SecuredMeta []byte          `json:"secured_meta" db:"secured_meta"` // BYTEA
}

// DB defines the interface for database operations.
type DB interface {
	CreateUser(ctx context.Context, user *User) error
	GetUser(ctx context.Context, id string) (*User, error)
	// Add other methods as needed
}
