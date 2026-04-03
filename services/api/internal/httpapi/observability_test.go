package httpapi

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"babyalbum/api/internal/blob"
)

func TestStatusRecorderImplementsFlusher(t *testing.T) {
	recorder := newStatusRecorder(httptest.NewRecorder())
	flusher, ok := any(recorder).(http.Flusher)
	if !ok {
		t.Fatal("expected statusRecorder to implement http.Flusher")
	}
	flusher.Flush()
}

func TestLoggerPrettyOutputUsesColorAndRedactsSensitiveFields(t *testing.T) {
	stdout := &bytes.Buffer{}
	stderr := &bytes.Buffer{}
	restore := swapLoggerForTest(newLogger(LoggingOptions{
		Format: "pretty",
		Color:  "always",
		Level:  "info",
	}, stdout, stderr, func() time.Time {
		return time.Date(2026, time.April, 3, 9, 0, 0, 0, time.UTC)
	}))
	defer restore()

	logEvent("error", "r2 upload failed", map[string]any{
		"status":         http.StatusForbidden,
		"bucket":         "baby-album-warm-cache",
		"node_token":     "secret-node-token",
		"signed_url":     "https://album-api.example.com/api/v1/media/media-1/original?exp=123&sig=secret",
		"request_id":     "req-1",
		"original_error": "403 Forbidden",
	})

	output := stderr.String()
	if !strings.Contains(output, "\x1b[") {
		t.Fatal("expected ANSI color codes in pretty log output")
	}
	if !strings.Contains(output, "ERROR") {
		t.Fatal("expected level in pretty log output")
	}
	if !strings.Contains(output, "node_token=[REDACTED]") {
		t.Fatalf("expected redacted token, got %q", output)
	}
	if strings.Contains(output, "sig=secret") {
		t.Fatalf("expected signed url to be redacted, got %q", output)
	}
	if !strings.Contains(output, "sig=%5BREDACTED%5D") {
		t.Fatalf("expected redacted signed url marker, got %q", output)
	}
}

func TestLoggerJSONOutputHonorsLevelAndRedacts(t *testing.T) {
	stdout := &bytes.Buffer{}
	restore := swapLoggerForTest(newLogger(LoggingOptions{
		Format: "json",
		Color:  "never",
		Level:  "warn",
	}, stdout, &bytes.Buffer{}, func() time.Time {
		return time.Date(2026, time.April, 3, 9, 30, 0, 0, time.UTC)
	}))
	defer restore()

	logEvent("info", "ignored", map[string]any{"request_id": "req-ignored"})
	logEvent("warn", "request completed", map[string]any{
		"status":        http.StatusForbidden,
		"authorization": "Bearer secret-token",
		"request_id":    "req-2",
	})

	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	if len(lines) != 1 {
		t.Fatalf("expected exactly one JSON log line, got %d", len(lines))
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(lines[0]), &payload); err != nil {
		t.Fatalf("decode json log: %v", err)
	}
	if payload["level"] != "warn" {
		t.Fatalf("expected warn level, got %#v", payload["level"])
	}
	if payload["authorization"] != "[REDACTED]" {
		t.Fatalf("expected redacted authorization, got %#v", payload["authorization"])
	}
}

func TestMiddlewareLogsForbiddenRequestSummary(t *testing.T) {
	stdout := &bytes.Buffer{}
	restore := swapLoggerForTest(newLogger(LoggingOptions{
		Format: "pretty",
		Color:  "never",
		Level:  "info",
	}, stdout, &bytes.Buffer{}, func() time.Time {
		return time.Date(2026, time.April, 3, 10, 0, 0, 0, time.UTC)
	}))
	defer restore()

	server := NewServer(&stubRepository{}, blob.New(t.TempDir()), 1024, []string{"https://allowed.example.com"})
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/app", nil)
	request.Header.Set("Origin", "https://blocked.example.com")

	server.withMiddleware(server.mux).ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", recorder.Code)
	}
	output := stdout.String()
	if !strings.Contains(output, "origin not allowed") {
		t.Fatalf("expected origin failure log, got %q", output)
	}
	if !strings.Contains(output, "request completed") || !strings.Contains(output, "status=403") {
		t.Fatalf("expected request summary log, got %q", output)
	}
}
