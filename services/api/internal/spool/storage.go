package spool

import (
	"fmt"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
)

type StoredFile struct {
	Path     string
	ByteSize int64
}

type Storage struct {
	root string
}

func New(root string) *Storage {
	return &Storage{root: root}
}

func (s *Storage) Save(sessionID, originalName string, file multipart.File) (StoredFile, error) {
	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return StoredFile{}, err
	}

	safeName := sanitizeName(originalName)
	if safeName == "" {
		safeName = "upload.bin"
	}

	destination := filepath.Join(s.root, fmt.Sprintf("%s-%s", sessionID, safeName))
	out, err := os.Create(destination)
	if err != nil {
		return StoredFile{}, err
	}
	defer out.Close()

	written, err := io.Copy(out, file)
	if err != nil {
		return StoredFile{}, err
	}

	return StoredFile{Path: destination, ByteSize: written}, nil
}

func sanitizeName(name string) string {
	replacer := strings.NewReplacer("..", "", "/", "-", `\`, "-", ":", "-", " ", "-")
	return replacer.Replace(name)
}
