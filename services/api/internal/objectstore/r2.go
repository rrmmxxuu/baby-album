package objectstore

import (
	"context"
	"os"

	"babyalbum/api/internal/r2cache"
)

type R2Store struct {
	client *r2cache.Client
}

func NewR2(client *r2cache.Client) *R2Store {
	return &R2Store{client: client}
}

func (s *R2Store) Enabled() bool {
	return s.client != nil && s.client.Enabled()
}

func (s *R2Store) PutBytes(ctx context.Context, key string, data []byte, contentType string) (PutResult, error) {
	file, err := os.CreateTemp("", "baby-album-object-*")
	if err != nil {
		return PutResult{}, err
	}
	defer os.Remove(file.Name())
	if _, err := file.Write(data); err != nil {
		_ = file.Close()
		return PutResult{}, err
	}
	if err := file.Close(); err != nil {
		return PutResult{}, err
	}
	return s.PutFile(ctx, key, file.Name(), contentType)
}

func (s *R2Store) PutFile(ctx context.Context, key, filePath, contentType string) (PutResult, error) {
	size, err := s.client.PutFile(ctx, key, filePath, contentType)
	if err != nil {
		return PutResult{}, err
	}
	return PutResult{Key: normalizeKey(key), ByteSize: size}, nil
}

func (s *R2Store) Get(ctx context.Context, key string) (GetResult, error) {
	result, err := s.client.Get(ctx, key)
	if err != nil {
		if err == r2cache.ErrNotFound {
			return GetResult{}, ErrNotFound
		}
		return GetResult{}, err
	}
	return GetResult{
		Body:          result.Body,
		ContentType:   result.ContentType,
		ContentLength: result.ContentLength,
		LastModified:  result.LastModified,
	}, nil
}

func (s *R2Store) Delete(ctx context.Context, key string) error {
	return s.client.Delete(ctx, key)
}
