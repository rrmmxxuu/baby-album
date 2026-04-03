package httpapi

import (
	"bytes"
	"image"
	"image/color"
	"image/jpeg"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

func TestHandleUploadSessionContentGeneratesPreviewInAPI(t *testing.T) {
	blobStorage := blob.New(t.TempDir())
	source := image.NewRGBA(image.Rect(0, 0, 1200, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 1200; x++ {
			source.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 120, A: 255})
		}
	}
	var upload bytes.Buffer
	if err := jpeg.Encode(&upload, source, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode source jpeg: %v", err)
	}

	called := false
	server := NewServer(&stubRepository{
		attachUploadContent: func(userID, sessionID string, input store.UploadContentInput) (domain.UploadSession, error) {
			called = true
			if userID != "user-1" {
				t.Fatalf("unexpected user id %s", userID)
			}
			if sessionID != "session-1" {
				t.Fatalf("unexpected session id %s", sessionID)
			}
			if input.BlobKey == "" {
				t.Fatal("expected original blob key")
			}
			if input.ContentSHA256 == "" {
				t.Fatal("expected original sha256")
			}
			if input.PreviewStatus != domain.PreviewReady {
				t.Fatalf("expected preview ready, got %s", input.PreviewStatus)
			}
			if input.PreviewBlobKey == "" {
				t.Fatal("expected preview blob key")
			}
			if input.Width != 1200 || input.Height != 600 {
				t.Fatalf("unexpected media size %dx%d", input.Width, input.Height)
			}
			previewFile, err := blobStorage.Open(input.PreviewBlobKey)
			if err != nil {
				t.Fatalf("open preview blob: %v", err)
			}
			defer previewFile.Close()
			cfg, format, err := image.DecodeConfig(previewFile)
			if err != nil {
				t.Fatalf("decode preview config: %v", err)
			}
			if format != "jpeg" {
				t.Fatalf("expected jpeg preview, got %s", format)
			}
			if cfg.Width != 480 || cfg.Height != 240 {
				t.Fatalf("unexpected preview size %dx%d", cfg.Width, cfg.Height)
			}
			return domain.UploadSession{ID: sessionID, Status: "uploaded"}, nil
		},
	}, blobStorage, 8<<20, nil)

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "moment.jpg")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write(upload.Bytes()); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/upload-sessions/session-1/content", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	request.Header.Set("X-User-ID", "user-1")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if !called {
		t.Fatal("expected AttachUploadContent to be called")
	}
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", recorder.Code)
	}
}

func TestServePreviewAssetMarksMissingPreviewBlob(t *testing.T) {
	called := false
	server := NewServer(&stubRepository{
		mediaByID: func(albumID, userID, mediaID string) (domain.MediaAsset, error) {
			return domain.MediaAsset{
				ID:             mediaID,
				FamilyID:       albumID,
				FileName:       "moment.jpg",
				MediaType:      "image/jpeg",
				UploadedAt:     time.Now().UTC(),
				PreviewStatus:  domain.PreviewReady,
				PreviewBlobKey: "missing-preview.jpg",
			}, nil
		},
		markPreviewMissing: func(mediaID string) error {
			called = true
			if mediaID != "media-1" {
				t.Fatalf("unexpected media id %s", mediaID)
			}
			return nil
		},
	}, blob.New(t.TempDir()), 8<<20, nil)
	server.cacheController = nil

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/media/media-1/preview?albumId=album-1", nil)
	request.Header.Set("X-User-ID", "user-1")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if !called {
		t.Fatal("expected preview to be marked missing")
	}
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder.Code)
	}
}

func TestServeOriginalAssetMarksMissingLocalOriginal(t *testing.T) {
	called := false
	server := NewServer(&stubRepository{
		mediaByID: func(albumID, userID, mediaID string) (domain.MediaAsset, error) {
			return domain.MediaAsset{
				ID:                 mediaID,
				FamilyID:           albumID,
				FileName:           "moment.jpg",
				MediaType:          "image/jpeg",
				Status:             domain.MediaReady,
				UploadedAt:         time.Now().UTC(),
				OriginalBlobKey:    "missing-original.jpg",
				OriginalPath:       "/nas/family/media-1/moment.jpg",
				OriginalLocalState: "online",
			}, nil
		},
		markOriginalMissing: func(mediaID string) error {
			called = true
			if mediaID != "media-1" {
				t.Fatalf("unexpected media id %s", mediaID)
			}
			return nil
		},
	}, blob.New(t.TempDir()), 8<<20, nil)
	server.cacheController = nil

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/media/media-1/original?albumId=album-1", nil)
	request.Header.Set("X-User-ID", "user-1")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if !called {
		t.Fatal("expected original blob to be marked missing")
	}
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", recorder.Code)
	}
}

func TestServeAvatarMarksMissingAvatarBlob(t *testing.T) {
	called := false
	server := NewServer(&stubRepository{
		babyByID: func(userID, albumID, babyID string) (domain.BabyProfile, error) {
			return domain.BabyProfile{
				ID:        babyID,
				FamilyID:  albumID,
				Name:      "Baby",
				AvatarKey: "missing-avatar.jpg",
				CreatedAt: time.Now().UTC(),
				HasAvatar: true,
			}, nil
		},
		clearBabyAvatar: func(babyID string) error {
			called = true
			if babyID != "baby-1" {
				t.Fatalf("unexpected baby id %s", babyID)
			}
			return nil
		},
	}, blob.New(t.TempDir()), 8<<20, nil)
	server.cacheController = nil

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/babies/baby-1/avatar?albumId=album-1", nil)
	request.Header.Set("X-User-ID", "user-1")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if !called {
		t.Fatal("expected avatar to be cleared")
	}
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder.Code)
	}
}
