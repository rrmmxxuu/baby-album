package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"time"
)

type requestMetadata struct {
	requestID string
	albumID   string
	userID    string
}

type requestMetadataKey struct{}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func newStatusRecorder(w http.ResponseWriter) *statusRecorder {
	return &statusRecorder{ResponseWriter: w, status: http.StatusOK}
}

func (w *statusRecorder) WriteHeader(status int) {
	w.status = status
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusRecorder) Write(data []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(data)
}

func (w *statusRecorder) Flush() {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	if flusher, ok := w.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func withRequestMetadata(r *http.Request) (*http.Request, *requestMetadata) {
	meta := &requestMetadata{
		requestID: newRequestID(),
	}
	ctx := context.WithValue(r.Context(), requestMetadataKey{}, meta)
	return r.WithContext(ctx), meta
}

func requestMetadataFromContext(r *http.Request) *requestMetadata {
	meta, _ := r.Context().Value(requestMetadataKey{}).(*requestMetadata)
	return meta
}

func setRequestUserID(r *http.Request, userID string) {
	meta := requestMetadataFromContext(r)
	if meta == nil || userID == "" {
		return
	}
	meta.userID = userID
}

func setRequestAlbumID(r *http.Request, albumID string) {
	meta := requestMetadataFromContext(r)
	if meta == nil || albumID == "" {
		return
	}
	meta.albumID = albumID
}

func requestIDFromContext(r *http.Request) string {
	meta := requestMetadataFromContext(r)
	if meta == nil {
		return ""
	}
	return meta.requestID
}

func newRequestID() string {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return time.Now().UTC().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(buf)
}

func logEvent(level, message string, fields map[string]any) {
	payload := map[string]any{
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"level":     level,
		"message":   message,
	}
	for key, value := range fields {
		if value == nil {
			continue
		}
		payload[key] = value
	}
	data, err := json.Marshal(payload)
	if err != nil {
		log.Printf(`{"timestamp":%q,"level":"error","message":"marshal log payload failed","error":%q}`, time.Now().UTC().Format(time.RFC3339Nano), err.Error())
		return
	}
	log.Print(string(data))
}
