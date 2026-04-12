package store

import (
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

// BlobStore defines the interface for storing binary blobs.
type BlobStore interface {
	Put(ctx context.Context, id string, r io.Reader) error
	Get(ctx context.Context, id string) (io.ReadCloser, error)
	Exists(ctx context.Context, id string) bool
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

func (s *LocalBlobStore) Put(ctx context.Context, id string, r io.Reader) error {
	path := filepath.Join(s.BasePath, id)

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
	path := filepath.Join(s.BasePath, id)

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
	path := filepath.Join(s.BasePath, id)
	_, err := os.Stat(path)
	return err == nil
}
