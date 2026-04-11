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
	Username string `json:"username,omitempty" db:"username"`
	Email    string `json:"email,omitempty" db:"-"`
	Phone    string `json:"phone,omitempty" db:"-"`

	PublicKey string `json:"public_key" db:"public_key"` // Public known

	// PIN fields
	PinHash   *string `json:"-" db:"pin_hash"`
	LoginCode *string `json:"-" db:"login_code"`

	EnabledExtensions json.RawMessage `json:"enabled_extensions" db:"enabled_extensions"`

	IsVerified bool `json:"is_verified" db:"is_verified"`

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
	Version        int             `json:"version" db:"version"`
	Metadata       json.RawMessage `json:"metadata" db:"metadata"`
	AccessKeys     json.RawMessage `json:"access_keys" db:"access_keys"`
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

// Profile represents the user's public profile data
type Profile struct {
	UserID        string `json:"user_id" db:"user_id"`
	AvatarSeed    string `json:"avatar_seed" db:"avatar_seed"`
	AvatarStyle   string `json:"avatar_style" db:"avatar_style"`
	AvatarSalt    string `json:"avatar_salt" db:"avatar_salt"`
	Bio           string `json:"bio" db:"bio"`
	Title         string `json:"title" db:"title"`
	ProfileStatus int    `json:"profile_status" db:"profile_status"`
}

// SearchResult represents an item found via global search.
type SearchResult struct {
	Type            string `json:"type"` // "profile" or "note"
	ID              string `json:"id"`
	Title           string `json:"title"`
	Username        string `json:"username"`
	OwnerID         string `json:"owner_id"`
	OwnerIsVerified bool   `json:"owner_is_verified"`
	Bio             string `json:"bio,omitempty"`
	AvatarSeed      string `json:"avatar_seed,omitempty"`
	AvatarSalt      string `json:"avatar_salt,omitempty"`
	AvatarStyle     string `json:"avatar_style,omitempty"`
}


type FileBackup struct {
	ID            string    `json:"id" db:"id"`
	FileID        string    `json:"file_id" db:"file_id"`
	SlotName      string    `json:"slot_name" db:"slot_name"`
	EncryptedBlob []byte    `json:"encrypted_blob" db:"encrypted_blob"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}
