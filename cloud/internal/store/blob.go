package store

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// BlobStore defines the interface for storing binary blobs.
type BlobStore interface {
	Put(ctx context.Context, id string, r io.Reader) error
	Get(ctx context.Context, id string) (io.ReadCloser, error)
	Exists(ctx context.Context, id string) bool
	Delete(ctx context.Context, id string) error
	GetSize(ctx context.Context, id string) (int64, error)
}

// LocalBlobStore implements BlobStore using the local filesystem.
type LocalBlobStore struct {
	BasePath string
}

func NewLocalBlobStore(basePath string) *LocalBlobStore {
	return &LocalBlobStore{
		BasePath: basePath,
	}
}

func (s *LocalBlobStore) resolvePath(id string) (string, error) {
	cleanBase := filepath.Clean(s.BasePath)
	target := filepath.Clean(filepath.Join(cleanBase, id))
	rel, err := filepath.Rel(cleanBase, target)
	if err != nil || strings.HasPrefix(rel, "..") || rel == "." {
		return "", fmt.Errorf("invalid blob id: path traversal detected")
	}
	return target, nil
}

func (s *LocalBlobStore) Put(ctx context.Context, id string, r io.Reader) error {
	path, err := s.resolvePath(id)
	if err != nil {
		return err
	}

	// Ensure directory exists
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	tempPath := fmt.Sprintf("%s.tmp.%d", path, time.Now().UnixNano())
	f, err := os.Create(tempPath)
	if err != nil {
		return err
	}

	_, err = io.Copy(f, r)
	f.Close()

	if err != nil {
		os.Remove(tempPath)
		return err
	}

	return os.Rename(tempPath, path)
}

func (s *LocalBlobStore) Get(ctx context.Context, id string) (io.ReadCloser, error) {
	path, err := s.resolvePath(id)
	if err != nil {
		return nil, err
	}

	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound // Using same error var as memory store for consistency? Or define new one?
			// Assuming usage of store.ErrNotFound in handlers.
		}
		return nil, err
	}
	return f, nil
}

func (s *LocalBlobStore) Exists(ctx context.Context, id string) bool {
	path, err := s.resolvePath(id)
	if err != nil {
		return false
	}
	_, err = os.Stat(path)
	return err == nil
}

func (s *LocalBlobStore) Delete(ctx context.Context, id string) error {
	path, err := s.resolvePath(id)
	if err != nil {
		return err
	}
	err = os.Remove(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	return nil
}

func (s *LocalBlobStore) GetSize(ctx context.Context, id string) (int64, error) {
	path, err := s.resolvePath(id)
	if err != nil {
		return 0, err
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return 0, ErrNotFound
		}
		return 0, err
	}
	return info.Size(), nil
}
