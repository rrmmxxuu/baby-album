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
