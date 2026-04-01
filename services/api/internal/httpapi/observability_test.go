package httpapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestStatusRecorderImplementsFlusher(t *testing.T) {
	recorder := newStatusRecorder(httptest.NewRecorder())
	flusher, ok := any(recorder).(http.Flusher)
	if !ok {
		t.Fatal("expected statusRecorder to implement http.Flusher")
	}
	flusher.Flush()
}
