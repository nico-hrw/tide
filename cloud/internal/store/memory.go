package store

import (
	"context"
	"errors"
	"sync"
	"time"

	"github.com/nicoh/tide/internal/db"
)

var (
	ErrNotFound = errors.New("record not found")
	ErrConflict = errors.New("record already exists")
)

// MemoryStore implements a thread-safe in-memory database.
type MemoryStore struct {
	mu            sync.RWMutex
	users         map[string]*db.User  // ID -> User
	usersByEmail  map[string]string    // Email -> ID
	files         map[string]*db.File  // ID -> File
	filesByParent map[string][]string  // ParentID -> []ID
	tokens        map[string]TokenData // Token -> TokenData
	// Links
	links         map[string]db.Link  // SourceID:TargetID -> Link
	linksBySource map[string][]string // SourceID -> []TargetID
	linksByTarget map[string][]string // TargetID -> []SourceID
}

type TokenData struct {
	UserID    string
	ExpiresAt time.Time
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		users:         make(map[string]*db.User),
		usersByEmail:  make(map[string]string),
		files:         make(map[string]*db.File),
		filesByParent: make(map[string][]string),
		tokens:        make(map[string]TokenData),
		links:         make(map[string]db.Link),
		linksBySource: make(map[string][]string),
		linksByTarget: make(map[string][]string),
	}
}

// --- User Operations ---

func (s *MemoryStore) CreateUser(ctx context.Context, user *db.User) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.usersByEmail[user.Email]; exists {
		return ErrConflict
	}
	if _, exists := s.users[user.ID]; exists {
		return ErrConflict
	}

	s.users[user.ID] = user
	s.usersByEmail[user.Email] = user.ID
	return nil
}

func (s *MemoryStore) GetUser(ctx context.Context, id string) (*db.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	user, ok := s.users[id]
	if !ok {
		return nil, ErrNotFound
	}
	return user, nil
}

func (s *MemoryStore) GetUserByEmail(ctx context.Context, email string) (*db.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	id, ok := s.usersByEmail[email]
	if !ok {
		return nil, ErrNotFound
	}
	id2, ok2 := s.users[id]
	if !ok2 {
		return nil, ErrNotFound
	}
	return id2, nil
}

// --- Token Operations ---

func (s *MemoryStore) SetToken(ctx context.Context, token string, userID string, ttl time.Duration) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.tokens[token] = TokenData{
		UserID:    userID,
		ExpiresAt: time.Now().Add(ttl),
	}
	return nil
}

func (s *MemoryStore) GetToken(ctx context.Context, token string) (string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, ok := s.tokens[token]
	if !ok {
		return "", ErrNotFound
	}
	if time.Now().After(data.ExpiresAt) {
		return "", ErrNotFound // Treat expired as not found
	}
	return data.UserID, nil
}

func (s *MemoryStore) DeleteToken(ctx context.Context, token string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.tokens, token)
	return nil
}

// --- File Operations ---

func (s *MemoryStore) CreateFile(ctx context.Context, file *db.File) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.files[file.ID]; exists {
		return ErrConflict
	}

	s.files[file.ID] = file

	parent := ""
	if file.ParentID != nil {
		parent = *file.ParentID
	}
	s.filesByParent[parent] = append(s.filesByParent[parent], file.ID)

	return nil
}

func (s *MemoryStore) GetFile(ctx context.Context, id string) (*db.File, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	file, ok := s.files[id]
	if !ok {
		return nil, ErrNotFound
	}
	return file, nil
}

func (s *MemoryStore) UpdateFile(ctx context.Context, file *db.File) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.files[file.ID]; !exists {
		return ErrNotFound
	}

	// Note: Updating parent would require updating filesByParent index, ignoring for MVP
	s.files[file.ID] = file
	return nil
}

func (s *MemoryStore) ListFiles(ctx context.Context, ownerID string, parentID *string) ([]*db.File, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []*db.File = []*db.File{}

	queryParent := ""
	if parentID != nil {
		queryParent = *parentID
	}

	ids, ok := s.filesByParent[queryParent]
	if !ok {
		return result, nil
	}

	for _, id := range ids {
		if f, exists := s.files[id]; exists && f.OwnerID == ownerID {
			result = append(result, f)
		}
	}

	return result, nil
}

// --- Link Operations ---

func (s *MemoryStore) CreateLink(ctx context.Context, link db.Link) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := link.SourceID + ":" + link.TargetID
	if _, exists := s.links[key]; exists {
		return ErrConflict
	}

	s.links[key] = link
	s.linksBySource[link.SourceID] = append(s.linksBySource[link.SourceID], link.TargetID)
	s.linksByTarget[link.TargetID] = append(s.linksByTarget[link.TargetID], link.SourceID)

	return nil
}

func (s *MemoryStore) DeleteLink(ctx context.Context, sourceID, targetID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	key := sourceID + ":" + targetID
	if _, exists := s.links[key]; !exists {
		return ErrNotFound
	}

	delete(s.links, key)

	// Remove from indices (inefficient slice removal for MVP)
	removeFromSlice := func(slice []string, val string) []string {
		for i, v := range slice {
			if v == val {
				return append(slice[:i], slice[i+1:]...)
			}
		}
		return slice
	}

	s.linksBySource[sourceID] = removeFromSlice(s.linksBySource[sourceID], targetID)
	s.linksByTarget[targetID] = removeFromSlice(s.linksByTarget[targetID], sourceID)

	return nil
}

func (s *MemoryStore) GetOutlinks(ctx context.Context, sourceID string) ([]db.Link, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []db.Link
	targetIDs := s.linksBySource[sourceID]
	for _, tid := range targetIDs {
		key := sourceID + ":" + tid
		if l, ok := s.links[key]; ok {
			result = append(result, l)
		}
	}
	return result, nil
}

func (s *MemoryStore) GetBacklinks(ctx context.Context, targetID string) ([]db.Link, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var result []db.Link
	sourceIDs := s.linksByTarget[targetID]
	for _, sid := range sourceIDs {
		key := sid + ":" + targetID
		if l, ok := s.links[key]; ok {
			result = append(result, l)
		}
	}
	return result, nil
}
