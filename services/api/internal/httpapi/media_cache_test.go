package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

func TestRunMaintenanceRepairsMissingPreviewBlob(t *testing.T) {
	blobStorage := blob.New(t.TempDir())
	source := image.NewRGBA(image.Rect(0, 0, 1200, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 1200; x++ {
			source.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 120, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, source, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode original blob: %v", err)
	}
	saved, err := blobStorage.SaveBytes("media-1", "moment.jpg", encoded.Bytes())
	if err != nil {
		t.Fatalf("save original blob: %v", err)
	}

	markedMissing := false
	attachedBlobKey := ""
	repo := &stubRepository{
		referencedBlobKeys: func() ([]string, error) {
			keys := []string{saved.Key}
			if attachedBlobKey != "" {
				keys = append(keys, attachedBlobKey)
			} else {
				keys = append(keys, "missing-preview.jpg")
			}
			return keys, nil
		},
		previewBlobAssets: func(limit int) ([]domain.MediaAsset, error) {
			return []domain.MediaAsset{{
				ID:              "media-1",
				FileName:        "moment.jpg",
				MediaType:       "image/jpeg",
				UploadedAt:      time.Now().UTC(),
				PreviewStatus:   domain.PreviewUnavailable,
				PreviewBlobKey:  "",
				OriginalBlobKey: saved.Key,
			}}, nil
		},
		markPreviewMissing: func(mediaID string) error {
			markedMissing = true
			if mediaID != "media-1" {
				t.Fatalf("unexpected media id %s", mediaID)
			}
			return nil
		},
		attachPreviewBlob: func(mediaID string, input store.PreviewBlobAttachmentInput) error {
			if mediaID != "media-1" {
				t.Fatalf("unexpected media id %s", mediaID)
			}
			if input.BlobKey == "" {
				t.Fatal("expected preview blob key")
			}
			attachedBlobKey = input.BlobKey
			return nil
		},
	}

	controller := newMediaCacheController(repo, blobStorage, Options{})
	controller.runMaintenance()

	if !markedMissing {
		t.Fatal("expected preview blob to be marked missing")
	}
	if attachedBlobKey == "" {
		t.Fatal("expected regenerated preview blob")
	}
	file, err := blobStorage.Open(attachedBlobKey)
	if err != nil {
		t.Fatalf("open regenerated preview blob: %v", err)
	}
	_ = file.Close()
}
