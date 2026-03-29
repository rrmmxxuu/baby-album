package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
)

type clientErrorPayload struct {
	Message     string         `json:"message"`
	Stack       string         `json:"stack"`
	Path        string         `json:"path"`
	UserAgent   string         `json:"userAgent"`
	DisplayMode string         `json:"displayMode"`
	RequestID   string         `json:"requestId"`
	AlbumID     string         `json:"albumId"`
	Extra       map[string]any `json:"extra"`
}

func (s *Server) handleClientErrors(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 64<<10)
	var input clientErrorPayload
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}

	message := strings.TrimSpace(input.Message)
	if message == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "message is required"})
		return
	}

	userID := ""
	if token := bearerToken(r); token != "" {
		if user, err := s.store.SessionUser(token); err == nil {
			userID = user.ID
			setRequestUserID(r, user.ID)
		}
	}
	if input.AlbumID != "" {
		setRequestAlbumID(r, input.AlbumID)
	}

	logEvent("error", "client error", map[string]any{
		"request_id":         requestIDFromContext(r),
		"client_request_id":  truncateLogValue(input.RequestID, 128),
		"user_id":            userID,
		"album_id":           truncateLogValue(input.AlbumID, 128),
		"path":               truncateLogValue(input.Path, 512),
		"user_agent":         truncateLogValue(input.UserAgent, 512),
		"display_mode":       truncateLogValue(input.DisplayMode, 64),
		"client_error":       truncateLogValue(message, 2000),
		"client_stack":       truncateLogValue(input.Stack, 8000),
		"client_error_extra": input.Extra,
	})

	writeJSON(w, http.StatusAccepted, map[string]string{"status": "logged"})
}

func truncateLogValue(value string, limit int) string {
	if limit <= 0 || len(value) <= limit {
		return value
	}
	return value[:limit]
}
