package r2cache

import (
	"context"
	"io"
	"net/http"
	"net/http/httputil"
	"os"
	"strconv"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return fn(req)
}

func TestPutFileSetsContentLength(t *testing.T) {
	var receivedContentLength int64 = -1
	var dumpedRequest string

	tempFile, err := os.CreateTemp(t.TempDir(), "r2-put-*.jpg")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	defer tempFile.Close()

	payload := "screen-preview-payload"
	if _, err := tempFile.WriteString(payload); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	if err := tempFile.Close(); err != nil {
		t.Fatalf("close temp file: %v", err)
	}

	client := New(Config{
		Endpoint:        "https://example.invalid",
		Bucket:          "test-bucket",
		AccessKeyID:     "access-key",
		SecretAccessKey: "secret-key",
		Region:          "auto",
	})
	client.httpClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.Method != http.MethodPut {
				t.Fatalf("expected PUT, got %s", r.Method)
			}
			if r.URL.Path != "/test-bucket/screen-previews/photo.jpg" {
				t.Fatalf("unexpected path %s", r.URL.Path)
			}
			receivedContentLength = r.ContentLength
			dump, err := httputil.DumpRequestOut(r, true)
			if err != nil {
				t.Fatalf("dump request: %v", err)
			}
			dumpedRequest = string(dump)
			return &http.Response{
				StatusCode: http.StatusOK,
				Status:     "200 OK",
				Body:       io.NopCloser(strings.NewReader("")),
				Header:     make(http.Header),
				Request:    r,
			}, nil
		}),
	}
	size, err := client.PutFile(context.Background(), "screen-previews/photo.jpg", tempFile.Name(), "image/jpeg")
	if err != nil {
		t.Fatalf("put file: %v", err)
	}

	if size != int64(len(payload)) {
		t.Fatalf("expected size %d, got %d", len(payload), size)
	}
	if receivedContentLength != int64(len(payload)) {
		t.Fatalf("expected content length %d, got %d", len(payload), receivedContentLength)
	}
	if !strings.Contains(dumpedRequest, "\r\nContent-Length: "+strconv.Itoa(len(payload))+"\r\n") {
		t.Fatalf("expected Content-Length header %d in request dump, got %q", len(payload), dumpedRequest)
	}
	if !strings.HasSuffix(dumpedRequest, payload) {
		t.Fatalf("expected payload at end of request dump, got %q", dumpedRequest)
	}
}

func TestPutFileReportsResponseBodyOnFailure(t *testing.T) {
	tempFile, err := os.CreateTemp(t.TempDir(), "r2-put-*.jpg")
	if err != nil {
		t.Fatalf("create temp file: %v", err)
	}
	if _, err := tempFile.WriteString("payload"); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	if err := tempFile.Close(); err != nil {
		t.Fatalf("close temp file: %v", err)
	}

	client := New(Config{
		Endpoint:        "https://example.invalid",
		Bucket:          "test-bucket",
		AccessKeyID:     "access-key",
		SecretAccessKey: "secret-key",
		Region:          "auto",
	})
	client.httpClient = &http.Client{
		Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			return &http.Response{
				StatusCode: http.StatusLengthRequired,
				Status:     "411 Length Required",
				Body:       io.NopCloser(strings.NewReader("MissingContentLength")),
				Header:     make(http.Header),
				Request:    r,
			}, nil
		}),
	}
	_, err = client.PutFile(context.Background(), "screen-previews/photo.jpg", tempFile.Name(), "image/jpeg")
	if err == nil {
		t.Fatal("expected put failure")
	}
	if !strings.Contains(err.Error(), "411 Length Required") {
		t.Fatalf("expected status in error, got %v", err)
	}
	if !strings.Contains(err.Error(), "MissingContentLength") {
		t.Fatalf("expected response body in error, got %v", err)
	}
}
