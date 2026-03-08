package store

import (
	"context"
	"time"

	"github.com/nicoh/tide/internal/db"
)

type Message struct {
	ID          string    `json:"id"`
	SenderID    string    `json:"sender_id"`
	RecipientID string    `json:"recipient_id"`
	Content     string    `json:"content"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"created_at"`
}

type Contact struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	ContactID string    `json:"contact_id"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"created_at"`
}

// Store defines the interface for database operations.
type Store interface {
	// User
	CreateUser(ctx context.Context, user *db.User) error
	GetUser(ctx context.Context, id string) (*db.User, error)
	GetUserByEmailHash(ctx context.Context, hash string) (*db.User, error)
	GetUserExtensions(ctx context.Context, id string) ([]string, error)

	// File
	CreateFile(ctx context.Context, file *db.File) error
	GetFile(ctx context.Context, id string) (*db.File, error)
	UpdateFile(ctx context.Context, file *db.File) error
	DeleteFile(ctx context.Context, id string) error
	ListFiles(ctx context.Context, ownerID string, parentID *string) ([]*db.File, error) // Legacy
	ListAccessibleFiles(ctx context.Context, viewerID string, parentID *string, query *string, recursive bool) ([]*db.File, error)
	GetAccessibleFile(ctx context.Context, id string, viewerID string) (*db.File, error)
	SetVisibility(ctx context.Context, fileID string, visibility string) error
	SetVisibilityRecursive(ctx context.Context, folderID string, visibility string) error
	ListPublicFiles(ctx context.Context, ownerID string) ([]*db.File, error)
	UserHasFileAccess(ctx context.Context, userID, fileID string) (bool, error)

	// Sharing
	ShareFile(ctx context.Context, fileID, userID string, securedMeta []byte) error
	AcceptShare(ctx context.Context, fileID string, userID string) error
	RemoveShare(ctx context.Context, fileID, userID string) error
	// AcceptShare? Usually handled by UpdateFile or specific method.
	// Check files.go AcceptShare handler implementation.

	// Link
	CreateLink(ctx context.Context, link db.Link) error
	DeleteLink(ctx context.Context, sourceID, targetID string) error
	GetOutlinks(ctx context.Context, sourceID string) ([]db.Link, error)
	GetBacklinks(ctx context.Context, targetID string) ([]db.Link, error)

	// Token
	SetToken(ctx context.Context, token string, userID string, ttl time.Duration) error
	GetToken(ctx context.Context, token string) (string, error)
	DeleteToken(ctx context.Context, token string) error

	// Messaging & Contacts
	GetContact(ctx context.Context, userID, partnerID string) (*Contact, error) // Check if Contact is in db or store package?
	// Wait, grep said Contact in sqlite.go. So likely store.Contact.
	// But messages.go uses h.Store.GetContact.
	// Let's assume store.Contact.
	// If db.Contact, I need to check import.
	// messages.go imports nicoh/tide/internal/store.
	// It does not use store.Contact explicitly in the snippet I saw?
	// "contact, _ := h.Store.GetContact... if contact == nil"
	// So inferred type.
	// Let's check sqlite.go again for Contact definition.
	// Proceeding with store.Contact assumption or generic *Contact.
	// Wait, `sqlite.go` is package store.
	// So `type Contact struct` is in store.

	CreateMessage(ctx context.Context, msg *Message) error
	GetMessages(ctx context.Context, user1, user2 string) ([]*Message, error)
	GetConversations(ctx context.Context, userID string) ([]*db.User, error)
	GetMessage(ctx context.Context, id string) (*Message, error)
	UpdateMessageStatus(ctx context.Context, id string, status string) error
	DeleteConversation(ctx context.Context, user1, user2 string) error
}
