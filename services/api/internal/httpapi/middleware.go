package httpapi

import (
	"net/http"
	"runtime/debug"
	"strings"
	"time"
)

func (s *Server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r, meta := withRequestMetadata(r)
		clientAddr := clientIP(r)
		recorder := newStatusRecorder(w)
		recorder.Header().Set("X-Request-ID", meta.requestID)
		recorder.Header().Set("X-Content-Type-Options", "nosniff")

		start := time.Now()
		defer func() {
			durationMs := time.Since(start).Milliseconds()
			if recovered := recover(); recovered != nil {
				logRequestEvent(r, "error", "request panic", map[string]any{
					"status":      http.StatusInternalServerError,
					"duration_ms": durationMs,
					"panic":       recovered,
					"stack":       string(debug.Stack()),
				})
				if !recorder.wroteHeader {
					writeJSON(recorder, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
				}
				return
			}
			logEvent(requestSummaryLevel(recorder.status), "request completed", map[string]any{
				"request_id":  meta.requestID,
				"method":      r.Method,
				"path":        r.URL.Path,
				"status":      recorder.status,
				"duration_ms": durationMs,
				"user_id":     meta.userID,
				"album_id":    meta.albumID,
				"node_id":     meta.nodeID,
				"client_ip":   clientAddr,
				"remote_addr": r.RemoteAddr,
			})
		}()

		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			recorder.Header().Add("Vary", "Origin")
			allowedOrigin, ok := s.allowedOrigin(origin)
			if !ok {
				logRequestEvent(r, "warn", "origin not allowed", map[string]any{
					"origin": origin,
				})
				writeJSON(recorder, http.StatusForbidden, map[string]string{"error": "origin not allowed"})
				return
			}
			recorder.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			recorder.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			recorder.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			recorder.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			recorder.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(recorder, r)
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
