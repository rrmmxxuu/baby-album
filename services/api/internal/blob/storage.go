package blob

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"hash"
	"io"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
)

type SavedBlob struct {
	Key           string
	ByteSize      int64
	ContentSHA256 string
}

type Storage struct{ root string }

func New(root string) *Storage { return &Storage{root: root} }

func (s *Storage) Root() string { return s.root }

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
	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(out, hasher), file)
	if err != nil {
		return SavedBlob{}, err
	}
	return SavedBlob{
		Key:           key,
		ByteSize:      written,
		ContentSHA256: hexDigest(hasher),
	}, nil
}

func (s *Storage) SaveBytes(prefix, originalName string, data []byte) (SavedBlob, error) {
	if err := os.MkdirAll(s.root, 0o755); err != nil {
		return SavedBlob{}, err
	}
	safeName := sanitizeName(originalName)
	if safeName == "" {
		safeName = "upload.bin"
	}
	key := fmt.Sprintf("%s-%s", prefix, safeName)
	path := filepath.Join(s.root, key)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return SavedBlob{}, err
	}
	sum := sha256.Sum256(data)
	return SavedBlob{
		Key:           key,
		ByteSize:      int64(len(data)),
		ContentSHA256: hex.EncodeToString(sum[:]),
	}, nil
}

func (s *Storage) SaveReader(prefix, originalName string, reader io.Reader) (SavedBlob, error) {
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
	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(out, hasher), reader)
	if err != nil {
		return SavedBlob{}, err
	}
	return SavedBlob{
		Key:           key,
		ByteSize:      written,
		ContentSHA256: hexDigest(hasher),
	}, nil
}

func (s *Storage) Open(key string) (*os.File, error) {
	return os.Open(filepath.Join(s.root, sanitizeName(key)))
}

func (s *Storage) Delete(key string) error {
	if strings.TrimSpace(key) == "" {
		return nil
	}
	err := os.Remove(filepath.Join(s.root, sanitizeName(key)))
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (s *Storage) UsedBytes() (int64, error) {
	var total int64
	err := filepath.Walk(s.root, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			if os.IsNotExist(walkErr) && path == s.root {
				return nil
			}
			return walkErr
		}
		if info == nil || info.IsDir() {
			return nil
		}
		total += info.Size()
		return nil
	})
	if err != nil {
		return 0, err
	}
	return total, nil
}

func sanitizeName(name string) string {
	replacer := strings.NewReplacer("..", "", "/", "-", `\`, "-", ":", "-", " ", "-")
	return replacer.Replace(name)
}

func hexDigest(hasher hash.Hash) string {
	return hex.EncodeToString(hasher.Sum(nil))
}
