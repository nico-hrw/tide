package store

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
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

func validateBlobKey(id string) (cleanRel string, dir string, err error) {
	if id == "" {
		return "", "", fmt.Errorf("invalid blob id: empty")
	}

	for i := 0; i < len(id); i++ {
		b := id[i]
		isAlphaNum := (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9')
		if !isAlphaNum && b != '-' && b != '_' && b != '.' && b != '/' {
			return "", "", fmt.Errorf("invalid blob id: disallowed character")
		}
	}

	segments := strings.Split(id, "/")
	for _, seg := range segments {
		if seg == "" || seg[0] == '.' {
			return "", "", fmt.Errorf("invalid blob id: unsafe path segment")
		}
	}

	cleanRel = filepath.FromSlash(id)
	dir = filepath.FromSlash(path.Dir(id))
	return cleanRel, dir, nil
}

func (s *LocalBlobStore) Put(ctx context.Context, id string, r io.Reader) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	cleanRel, dir, err := validateBlobKey(id)
	if err != nil {
		return err
	}

	if err := os.MkdirAll(s.BasePath, 0700); err != nil {
		return err
	}

	root, err := os.OpenRoot(s.BasePath)
	if err != nil {
		return err
	}
	defer root.Close()

	if dir != "." {
		if err := root.MkdirAll(dir, 0700); err != nil {
			return err
		}
	}

	var randBytes [16]byte
	if _, err := rand.Read(randBytes[:]); err != nil {
		return fmt.Errorf("failed to generate temp filename: %w", err)
	}
	tempName := ".tmp-" + hex.EncodeToString(randBytes[:])
	tempRel := tempName
	if dir != "." {
		tempRel = filepath.Join(dir, tempName)
	}

	f, err := root.OpenFile(tempRel, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}

	cleanup := true
	defer func() {
		if cleanup {
			_ = root.Remove(tempRel)
		}
	}()

	if _, err := io.Copy(f, r); err != nil {
		_ = f.Close()
		return err
	}

	if err := f.Sync(); err != nil {
		_ = f.Close()
		return err
	}

	if err := f.Close(); err != nil {
		return err
	}

	if err := root.Rename(tempRel, cleanRel); err != nil {
		return err
	}

	cleanup = false
	return nil
}

func (s *LocalBlobStore) Get(ctx context.Context, id string) (io.ReadCloser, error) {
	cleanRel, _, err := validateBlobKey(id)
	if err != nil {
		return nil, err
	}

	root, err := os.OpenRoot(s.BasePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	defer root.Close()

	f, err := root.Open(cleanRel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return f, nil
}

func (s *LocalBlobStore) Exists(ctx context.Context, id string) bool {
	cleanRel, _, err := validateBlobKey(id)
	if err != nil {
		return false
	}

	root, err := os.OpenRoot(s.BasePath)
	if err != nil {
		return false
	}
	defer root.Close()

	_, err = root.Stat(cleanRel)
	return err == nil
}

func (s *LocalBlobStore) Delete(ctx context.Context, id string) error {
	cleanRel, _, err := validateBlobKey(id)
	if err != nil {
		return err
	}

	root, err := os.OpenRoot(s.BasePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	defer root.Close()

	err = root.Remove(cleanRel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	return nil
}

func (s *LocalBlobStore) GetSize(ctx context.Context, id string) (int64, error) {
	cleanRel, _, err := validateBlobKey(id)
	if err != nil {
		return 0, err
	}

	root, err := os.OpenRoot(s.BasePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, ErrNotFound
		}
		return 0, err
	}
	defer root.Close()

	info, err := root.Stat(cleanRel)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return 0, ErrNotFound
		}
		return 0, err
	}
	return info.Size(), nil
}
