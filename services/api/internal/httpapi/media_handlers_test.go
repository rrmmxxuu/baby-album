package httpapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/objectstore"
	"babyalbum/api/internal/store"
)

const sampleHEICBase64 = "AAAAHGZ0eXBoZWl4AAAAAG1pZjFoZWl4bWlhZgAAAXZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAGaAAEAAAAAAAAAIwAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGh2YzEAAAAA9mlwcnAAAADWaXBjbwAAAHFodmNDAQQIAAAAAAAAAAAAHvAA/Pz4+AAADwNgAAEAF0ABDAH//wQIAAADAJ/4AAADAAAeugJAYQABACZCAQEECAAAAwCf+AAAAwAAHsCCBBZbqrprmwIAAAMAAgAAAwACEGIAAQAGRAHBc8GJAAAAE2NvbHJuY2x4AAEADQAGgAAAABRpc3BlAAAAAAAAAEAAAABAAAAAKGNsYXAAAAAQAAAAAQAAABAAAAAB////0AAAAAL////QAAAAAgAAAA5waXhpAAAAAAEIAAAAGGlwbWEAAAAAAAAAAQABBYECAwWEAAAAK21kYXQAAAAfKAGuJkJKJOfXDf/+HwsXYVVzU7JsIGJEKRKAY/X0rg=="

type failingObjectStore struct {
	putErr error
}

func (s *failingObjectStore) Enabled() bool { return true }

func (s *failingObjectStore) PutBytes(_ context.Context, _ string, _ []byte, _ string) (objectstore.PutResult, error) {
	return objectstore.PutResult{}, s.putErr
}

func (s *failingObjectStore) PutFile(_ context.Context, _ string, _ string, _ string) (objectstore.PutResult, error) {
	return objectstore.PutResult{}, s.putErr
}

func (s *failingObjectStore) Get(_ context.Context, _ string) (objectstore.GetResult, error) {
	return objectstore.GetResult{}, objectstore.ErrNotFound
}

func (s *failingObjectStore) Delete(_ context.Context, _ string) error { return nil }

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
			if input.DetectedMediaType != "image/jpeg" {
				t.Fatalf("expected detected media type image/jpeg, got %s", input.DetectedMediaType)
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
	request.Header.Set("Authorization", "Bearer test-session")

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
	request.Header.Set("Authorization", "Bearer test-session")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if !called {
		t.Fatal("expected preview to be marked missing")
	}
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder.Code)
	}
}

func TestHandleMediaOriginalStatusIsReadOnly(t *testing.T) {
	triggerRestore := false
	server := NewServer(&stubRepository{
		resolveOriginal: func(userID, albumID, mediaID string, requested bool) (domain.MediaAsset, error) {
			triggerRestore = requested
			return domain.MediaAsset{
				ID:                 mediaID,
				FamilyID:           albumID,
				FileName:           "moment.jpg",
				MediaType:          "image/jpeg",
				UploadedAt:         time.Now().UTC(),
				Status:             domain.MediaReady,
				OriginalPath:       "/library/family/media-1/moment.jpg",
				OriginalLocalState: "evicted",
			}, nil
		},
	}, blob.New(t.TempDir()), 8<<20, nil)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/media/media-1/original-status?albumId=album-1", nil)
	request.Header.Set("Authorization", "Bearer test-session")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if triggerRestore {
		t.Fatal("expected original status lookup to stay read-only")
	}
}

func TestHandleMediaOriginalRestoreUsesExplicitPost(t *testing.T) {
	triggerRestore := false
	server := NewServer(&stubRepository{
		resolveOriginal: func(userID, albumID, mediaID string, requested bool) (domain.MediaAsset, error) {
			triggerRestore = requested
			return domain.MediaAsset{
				ID:                   mediaID,
				FamilyID:             albumID,
				FileName:             "moment.jpg",
				MediaType:            "image/jpeg",
				UploadedAt:           time.Now().UTC(),
				Status:               domain.MediaReady,
				OriginalPath:         "/library/family/media-1/moment.jpg",
				OriginalLocalState:   "evicted",
				OriginalRestoreState: "pending",
			}, nil
		},
	}, blob.New(t.TempDir()), 8<<20, nil)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/media/media-1/original-restore?albumId=album-1", nil)
	request.Header.Set("Authorization", "Bearer test-session")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if !triggerRestore {
		t.Fatal("expected explicit restore endpoint to request restore")
	}
}

func TestSignedPreviewURLSurvivesProcessedAtUpdate(t *testing.T) {
	blobStorage := blob.New(t.TempDir())
	saved, err := blobStorage.SaveBytes("preview", "moment.jpg", []byte("preview"))
	if err != nil {
		t.Fatalf("seed preview blob: %v", err)
	}

	uploadedAt := time.Date(2026, time.April, 4, 14, 25, 35, 0, time.UTC)
	item := domain.MediaAsset{
		ID:             "media-1",
		FileName:       "moment.jpg",
		UploadedAt:     uploadedAt,
		PreviewStatus:  domain.PreviewReady,
		PreviewBlobKey: saved.Key,
	}
	server := NewServer(&stubRepository{
		mediaByPublicID: func(mediaID string) (domain.MediaAsset, error) {
			if mediaID != item.ID {
				t.Fatalf("unexpected media id %s", mediaID)
			}
			return item, nil
		},
	}, blobStorage, 8<<20, nil)

	signedURL := server.signedMediaURL(
		mediaPublicPath("media", item.ID, "preview"),
		previewURLKind,
		mediaVersionForKind(item, previewURLKind),
		time.Now().UTC().Add(time.Hour),
	)
	processedAt := uploadedAt.Add(6 * time.Second)
	item.ProcessedAt = &processedAt

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, signedURL, nil)

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if recorder.Body.String() != "preview" {
		t.Fatalf("unexpected preview body %q", recorder.Body.String())
	}
}

func TestSignedScreenPreviewURLSurvivesProcessedAtUpdate(t *testing.T) {
	blobStorage := blob.New(t.TempDir())
	server := NewServerWithOptions(&stubRepository{}, blobStorage, Options{
		MaxUploadBytes: 8 << 20,
		R2LocalRoot:    t.TempDir(),
	})
	if server.screenPreviews == nil || !server.screenPreviews.Enabled() {
		t.Fatal("expected screen preview store to be configured")
	}
	saved, err := server.screenPreviews.PutBytes(context.Background(), "screen-previews/media-1-preview.jpg", []byte("screen-preview"), "image/jpeg")
	if err != nil {
		t.Fatalf("seed screen preview object: %v", err)
	}

	uploadedAt := time.Date(2026, time.April, 4, 14, 25, 35, 0, time.UTC)
	item := domain.MediaAsset{
		ID:                     "media-1",
		FileName:               "moment.jpg",
		UploadedAt:             uploadedAt,
		ScreenPreviewStatus:    domain.PreviewReady,
		ScreenPreviewObjectKey: saved.Key,
	}
	server.store = &stubRepository{
		mediaByPublicID: func(mediaID string) (domain.MediaAsset, error) {
			if mediaID != item.ID {
				t.Fatalf("unexpected media id %s", mediaID)
			}
			return item, nil
		},
	}
	server.mediaStore = server.store.(mediaStateStore)

	signedURL := server.signedMediaURL(
		mediaPublicPath("media", item.ID, "screen-preview"),
		screenPreviewURLKind,
		mediaVersionForKind(item, screenPreviewURLKind),
		time.Now().UTC().Add(time.Hour),
	)
	processedAt := uploadedAt.Add(6 * time.Second)
	item.ProcessedAt = &processedAt

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, signedURL, nil)

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if recorder.Body.String() != "screen-preview" {
		t.Fatalf("unexpected screen preview body %q", recorder.Body.String())
	}
}

func TestApplyDeleteCleanupRemovesScreenPreviewObject(t *testing.T) {
	blobStorage := blob.New(t.TempDir())
	server := NewServerWithOptions(&stubRepository{}, blobStorage, Options{
		MaxUploadBytes: 8 << 20,
		R2LocalRoot:    t.TempDir(),
	})
	if server.screenPreviews == nil || !server.screenPreviews.Enabled() {
		t.Fatal("expected screen preview store to be configured")
	}
	if _, err := server.screenPreviews.PutBytes(context.Background(), "screen-previews/media-1-preview.jpg", []byte("preview"), "image/jpeg"); err != nil {
		t.Fatalf("seed screen preview object: %v", err)
	}

	server.applyDeleteCleanup(store.DeleteCleanup{
		ScreenPreviewObjectKeys: []string{"screen-previews/media-1-preview.jpg"},
	})

	if _, err := server.screenPreviews.Get(context.Background(), "screen-previews/media-1-preview.jpg"); err == nil {
		t.Fatal("expected screen preview object to be deleted")
	}
}

func TestEnsureMediaPreviewsRepairsHEICFromOriginalBlob(t *testing.T) {
	blobStorage := blob.New(t.TempDir())
	heicData, err := base64.StdEncoding.DecodeString(sampleHEICBase64)
	if err != nil {
		t.Fatalf("decode heic fixture: %v", err)
	}
	saved, err := blobStorage.SaveBytes("media-1", "sample.heic", heicData)
	if err != nil {
		t.Fatalf("seed original blob: %v", err)
	}
	if !heicPreviewSupported(t, filepath.Join(blobStorage.Root(), saved.Key)) {
		t.Skip("ffmpeg on this runner does not support HEIC decoding")
	}

	server := NewServerWithOptions(&stubRepository{}, blobStorage, Options{
		MaxUploadBytes: 8 << 20,
		R2LocalRoot:    t.TempDir(),
	})
	if server.cacheController == nil {
		t.Fatal("expected cache controller")
	}

	item, err := server.cacheController.EnsureMediaPreviews(context.Background(), domain.MediaAsset{
		ID:                  "media-1",
		FamilyID:            "album-1",
		FileName:            "sample.heic",
		MediaType:           "image/heic",
		OriginalBlobKey:     saved.Key,
		OriginalLocalState:  "online",
		PreviewStatus:       domain.PreviewUnavailable,
		ScreenPreviewStatus: domain.PreviewUnavailable,
		UploadedAt:          time.Now().UTC(),
	})
	if err != nil {
		t.Fatalf("repair heic previews: %v", err)
	}
	if item.PreviewStatus != domain.PreviewReady {
		t.Fatalf("expected preview ready, got %s", item.PreviewStatus)
	}
	if item.ScreenPreviewStatus != domain.PreviewReady {
		t.Fatalf("expected screen preview ready, got %s", item.ScreenPreviewStatus)
	}
	if item.Width <= 0 || item.Height <= 0 {
		t.Fatalf("expected positive dimensions, got %dx%d", item.Width, item.Height)
	}
	if item.PreviewBlobKey == "" {
		t.Fatal("expected preview blob key")
	}
	if item.ScreenPreviewObjectKey == "" {
		t.Fatal("expected screen preview object key")
	}
}

func heicPreviewSupported(t *testing.T, sourcePath string) bool {
	t.Helper()
	if _, err := exec.LookPath("ffmpeg"); err != nil {
		return false
	}
	tempDir := t.TempDir()
	outputPath := filepath.Join(tempDir, "probe.jpg")
	cmd := exec.Command(
		"ffmpeg",
		"-v", "error",
		"-y",
		"-i", sourcePath,
		"-frames:v", "1",
		outputPath,
	)
	if err := cmd.Run(); err != nil {
		return false
	}
	info, err := os.Stat(outputPath)
	return err == nil && info.Size() > 0
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
	request.Header.Set("Authorization", "Bearer test-session")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if !called {
		t.Fatal("expected original blob to be marked missing")
	}
	if recorder.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d", recorder.Code)
	}
}

func TestGenerateUploadedMediaPreviewLogsScreenPreviewSaveFailure(t *testing.T) {
	stderr := &bytes.Buffer{}
	restore := swapLoggerForTest(newLogger(LoggingOptions{
		Format: "pretty",
		Color:  "never",
		Level:  "info",
	}, &bytes.Buffer{}, stderr, func() time.Time {
		return time.Date(2026, time.April, 3, 11, 0, 0, 0, time.UTC)
	}))
	defer restore()

	blobStorage := blob.New(t.TempDir())
	source := image.NewRGBA(image.Rect(0, 0, 1200, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 1200; x++ {
			source.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 120, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := jpeg.Encode(&encoded, source, &jpeg.Options{Quality: 90}); err != nil {
		t.Fatalf("encode source jpeg: %v", err)
	}
	saved, err := blobStorage.SaveBytes("media-1", "moment.jpg", encoded.Bytes())
	if err != nil {
		t.Fatalf("seed original blob: %v", err)
	}

	server := NewServerWithOptions(&stubRepository{}, blobStorage, Options{
		MaxUploadBytes: 8 << 20,
		R2LocalRoot:    t.TempDir(),
	})
	failingStore := &failingObjectStore{putErr: errors.New("r2 put screen-previews/media-1-preview.jpg failed: 403 Forbidden")}
	server.screenPreviews = failingStore
	if server.cacheController != nil {
		server.cacheController.screenPreviews = failingStore
	}

	preview := server.generateUploadedMediaPreview(saved.Key, "moment.jpg", "image/jpeg")
	if preview.Status != domain.PreviewReady {
		t.Fatalf("expected thumb preview ready, got %s", preview.Status)
	}
	if preview.ScreenPreviewStatus != domain.PreviewUnavailable {
		t.Fatalf("expected screen preview unavailable, got %s", preview.ScreenPreviewStatus)
	}
	if !strings.Contains(stderr.String(), "save screen preview failed") || !strings.Contains(stderr.String(), "403 Forbidden") {
		t.Fatalf("expected detailed screen preview failure log, got %q", stderr.String())
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
	request.Header.Set("Authorization", "Bearer test-session")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if !called {
		t.Fatal("expected avatar to be cleared")
	}
	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder.Code)
	}
}
