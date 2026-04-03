package objectstore

import (
	"context"
	"io"
	"time"
)

type PutResult struct {
	Key      string
	ByteSize int64
}

type GetResult struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
	LastModified  time.Time
}

type Store interface {
	Enabled() bool
	PutBytes(ctx context.Context, key string, data []byte, contentType string) (PutResult, error)
	PutFile(ctx context.Context, key, filePath, contentType string) (PutResult, error)
	Get(ctx context.Context, key string) (GetResult, error)
	Delete(ctx context.Context, key string) error
}
