package objectstore

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime"
	"os"
	"path/filepath"
	"strings"
	"time"
)

var ErrNotFound = errors.New("object not found")

type LocalFSStore struct {
	root string
}

func NewLocalFS(root string) *LocalFSStore {
	return &LocalFSStore{root: strings.TrimSpace(root)}
}

func (s *LocalFSStore) Enabled() bool {
	return s.root != ""
}

func (s *LocalFSStore) PutBytes(_ context.Context, key string, data []byte, _ string) (PutResult, error) {
	if !s.Enabled() {
		return PutResult{}, errors.New("local object store is not configured")
	}
	path := s.objectPath(key)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return PutResult{}, err
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return PutResult{}, err
	}
	return PutResult{Key: normalizeKey(key), ByteSize: int64(len(data))}, nil
}

func (s *LocalFSStore) PutFile(_ context.Context, key, filePath, _ string) (PutResult, error) {
	if !s.Enabled() {
		return PutResult{}, errors.New("local object store is not configured")
	}
	data, err := os.ReadFile(filePath)
	if err != nil {
		return PutResult{}, err
	}
	return s.PutBytes(context.Background(), key, data, "")
}

func (s *LocalFSStore) Get(_ context.Context, key string) (GetResult, error) {
	if !s.Enabled() {
		return GetResult{}, errors.New("local object store is not configured")
	}
	path := s.objectPath(key)
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return GetResult{}, ErrNotFound
		}
		return GetResult{}, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return GetResult{}, err
	}
	contentType := mime.TypeByExtension(filepath.Ext(path))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	return GetResult{
		Body:          file,
		ContentType:   contentType,
		ContentLength: info.Size(),
		LastModified:  info.ModTime().UTC(),
	}, nil
}

func (s *LocalFSStore) Delete(_ context.Context, key string) error {
	if !s.Enabled() {
		return nil
	}
	err := os.Remove(s.objectPath(key))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *LocalFSStore) objectPath(key string) string {
	trimmed := normalizeKey(key)
	if trimmed == "" {
		return s.root
	}
	parts := strings.Split(trimmed, "/")
	safeParts := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		safeParts = append(safeParts, sanitizeSegment(part))
	}
	return filepath.Join(append([]string{s.root}, safeParts...)...)
}

func normalizeKey(key string) string {
	return strings.Trim(strings.TrimSpace(key), "/")
}

func sanitizeSegment(value string) string {
	replacer := strings.NewReplacer("..", "", "/", "-", `\`, "-", ":", "-", " ", "-")
	return replacer.Replace(value)
}

func ReadAll(result GetResult) ([]byte, error) {
	defer result.Body.Close()
	var buffer bytes.Buffer
	if _, err := io.Copy(&buffer, result.Body); err != nil {
		return nil, err
	}
	return buffer.Bytes(), nil
}

func LastModifiedOrNow(ts time.Time) time.Time {
	if ts.IsZero() {
		return time.Now().UTC()
	}
	return ts.UTC()
}
