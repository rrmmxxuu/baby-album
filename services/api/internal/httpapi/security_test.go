package httpapi

import (
	"bytes"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/store"
)

func TestActorIDRejectsHeaderAndQueryFallbacks(t *testing.T) {
	server := NewServer(&stubRepository{}, blob.New(t.TempDir()), 1024, nil)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/bootstrap?userId=user-1", nil)
	request.Header.Set("X-User-ID", "user-1")

	_, err := server.actorID(request)
	if !errors.Is(err, store.ErrUnauthorized) {
		t.Fatalf("expected unauthorized, got %v", err)
	}
}

func TestBearerTokenIgnoresQueryString(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/app?token=query-token", nil)

	if token := bearerToken(request); token != "" {
		t.Fatalf("expected empty token, got %q", token)
	}
}

func TestClientIPIgnoresForwardedHeadersWithoutTrustedProxyConfig(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/app", nil)
	request.RemoteAddr = "10.20.30.40:1234"
	request.Header.Set("X-Forwarded-For", "203.0.113.9")
	request.Header.Set("X-Real-IP", "198.51.100.7")

	if ip := clientIP(request); ip != "10.20.30.40" {
		t.Fatalf("expected remote host, got %q", ip)
	}
}

func TestClientIPUsesForwardedHeadersOnlyForTrustedProxyCIDRs(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/app", nil)
	request.RemoteAddr = "10.20.30.40:1234"
	request.Header.Set("X-Forwarded-For", "203.0.113.9")
	request = withTrustedProxyCIDRs(request, parseTrustedProxyCIDRs([]string{"10.0.0.0/8"}))

	if ip := clientIP(request); ip != "203.0.113.9" {
		t.Fatalf("expected forwarded client ip, got %q", ip)
	}
}

func TestInvitePreviewEndpointReturnsNotFound(t *testing.T) {
	server := NewServer(&stubRepository{}, blob.New(t.TempDir()), 1024, nil)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/invites/ABCDEFGHJKLM", nil)

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", recorder.Code)
	}
}

func TestAvatarUploadRejectsUnsupportedFileType(t *testing.T) {
	server := NewServer(&stubRepository{}, blob.New(t.TempDir()), 8<<20, nil)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "avatar.txt")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("not-an-image")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/albums/album-1/babies/baby-1/avatar", &body)
	request.Header.Set("Authorization", "Bearer test-session")
	request.Header.Set("Content-Type", writer.FormDataContentType())

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestMediaUploadRejectsPlaylistMasqueradingAsVideo(t *testing.T) {
	server := NewServer(&stubRepository{}, blob.New(t.TempDir()), 8<<20, nil)
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", "stream.mp4")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	if _, err := part.Write([]byte("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1280000\nhttp://169.254.169.254/latest/meta-data/\n")); err != nil {
		t.Fatalf("write form file: %v", err)
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/v1/upload-sessions/session-1/content", &body)
	request.Header.Set("Authorization", "Bearer test-session")
	request.Header.Set("Content-Type", writer.FormDataContentType())

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d: %s", recorder.Code, recorder.Body.String())
	}
}

func TestDetectStoredMediaTypeDoesNotTrustClientOrExtensionForPlaylistText(t *testing.T) {
	root := t.TempDir()
	sourcePath := root + "/stream.mp4"
	if err := os.WriteFile(sourcePath, []byte("#EXTM3U\n#EXTINF:10,\nsegment.ts\n"), 0o644); err != nil {
		t.Fatalf("write sample file: %v", err)
	}

	mediaType := detectStoredMediaType(sourcePath, "stream.mp4")
	if mediaType != "" {
		t.Fatalf("expected empty detected media type, got %q", mediaType)
	}
}

func TestRestrictedFFmpegArgsWhitelistLocalProtocolsOnly(t *testing.T) {
	ffprobeArgs := strings.Join(buildFFprobeReadArgs("/tmp/sample.mp4", "-show_entries", "stream=width,height"), " ")
	if !strings.Contains(ffprobeArgs, "-protocol_whitelist file,pipe,data") {
		t.Fatalf("expected ffprobe whitelist, got %q", ffprobeArgs)
	}
	if !strings.Contains(ffprobeArgs, "-protocol_blacklist") || !strings.Contains(ffprobeArgs, "http,https") {
		t.Fatalf("expected ffprobe blacklist to block network protocols, got %q", ffprobeArgs)
	}

	ffmpegArgs := strings.Join(buildFFmpegReadArgs("/tmp/sample.mp4", "-frames:v", "1", "/tmp/out.jpg"), " ")
	if !strings.Contains(ffmpegArgs, "-protocol_whitelist file,pipe,data") {
		t.Fatalf("expected ffmpeg whitelist, got %q", ffmpegArgs)
	}
	if !strings.Contains(ffmpegArgs, "-protocol_blacklist") || !strings.Contains(ffmpegArgs, "rtsp") {
		t.Fatalf("expected ffmpeg blacklist to block network protocols, got %q", ffmpegArgs)
	}
}
