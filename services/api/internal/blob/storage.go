package blob

import (
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
)

type SavedBlob struct {
	Key      string
	ByteSize int64
}

type Storage struct{ root string }

func New(root string) *Storage { return &Storage{root: root} }

func (s *Storage) Save(prefix, originalName string, file multipart.File) (SavedBlob, error) {
	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return SavedBlob{}, err
	}
	safeName := sanitizeName(originalName)
	if safeName == "" {
		safeName = "upload.bin"
	}
	key := fmt.Sprintf("%s-%s", prefix, safeName)
	path := filepath.Join(s.root, key)
	out, err := os.Create(path)
	if err != nil {
		return SavedBlob{}, err
	}
	defer out.Close()
	written, err := io.Copy(out, file)
	if err != nil {
		return SavedBlob{}, err
	}
	return SavedBlob{Key: key, ByteSize: written}, nil
}

func (s *Storage) Open(key string) (*os.File, error) {
	return os.Open(filepath.Join(s.root, sanitizeName(key)))
}

func sanitizeName(name string) string {
	replacer := strings.NewReplacer("..", "", "/", "-", `\`, "-", ":", "-", " ", "-")
	return replacer.Replace(name)
}
