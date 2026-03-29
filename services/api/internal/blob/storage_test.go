package blob

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"testing"
)

type inMemoryMultipartFile struct {
	*bytes.Reader
}

func (inMemoryMultipartFile) Close() error { return nil }

func TestSaveComputesByteSizeAndSHA256(t *testing.T) {
	root := t.TempDir()
	storage := New(root)
	content := []byte("hello baby album")

	saved, err := storage.Save("upload-1", "photo.jpg", inMemoryMultipartFile{Reader: bytes.NewReader(content)})
	if err != nil {
		t.Fatalf("Save returned error: %v", err)
	}

	sum := sha256.Sum256(content)
	if saved.ByteSize != int64(len(content)) {
		t.Fatalf("expected byte size %d, got %d", len(content), saved.ByteSize)
	}
	if saved.ContentSHA256 != hex.EncodeToString(sum[:]) {
		t.Fatalf("unexpected sha256 %s", saved.ContentSHA256)
	}
	if filepath.Base(saved.Key) != "upload-1-photo.jpg" {
		t.Fatalf("unexpected blob key %s", saved.Key)
	}
}

func TestSaveBytesComputesByteSizeAndSHA256(t *testing.T) {
	root := t.TempDir()
	storage := New(root)
	content := []byte("avatar bytes")

	saved, err := storage.SaveBytes("avatar-1", "avatar.jpg", content)
	if err != nil {
		t.Fatalf("SaveBytes returned error: %v", err)
	}

	sum := sha256.Sum256(content)
	if saved.ByteSize != int64(len(content)) {
		t.Fatalf("expected byte size %d, got %d", len(content), saved.ByteSize)
	}
	if saved.ContentSHA256 != hex.EncodeToString(sum[:]) {
		t.Fatalf("unexpected sha256 %s", saved.ContentSHA256)
	}
}
