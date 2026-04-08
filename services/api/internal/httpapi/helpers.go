package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"

	"babyalbum/api/internal/store"
)

func (s *Server) actorID(r *http.Request) (string, error) {
	token := bearerToken(r)
	if token == "" {
		return "", store.ErrUnauthorized
	}
	user, err := s.store.SessionUser(token)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(user.ID) == "" {
		return "", store.ErrUnauthorized
	}
	setRequestUserID(r, user.ID)
	return user.ID, nil
}

func bearerToken(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return strings.TrimSpace(value[7:])
	}
	return ""
}

func albumID(r *http.Request) string {
	if value := r.URL.Query().Get("albumId"); value != "" {
		setRequestAlbumID(r, value)
		return value
	}
	value := r.URL.Query().Get("familyId")
	setRequestAlbumID(r, value)
	return value
}

func trimAPIPrefix(path, prefix string) string {
	return strings.Trim(strings.TrimPrefix(path, prefix), "/")
}

func clientIP(r *http.Request) string {
	if trustedProxy(r.RemoteAddr) {
		if value := firstForwardedFor(r.Header.Get("X-Forwarded-For")); value != "" {
			return value
		}
		if value := strings.TrimSpace(r.Header.Get("X-Real-IP")); value != "" {
			return value
		}
	}
	return remoteHost(r.RemoteAddr)
}

func trustedProxy(remoteAddr string) bool {
	host := remoteHost(remoteAddr)
	if host == "" {
		return false
	}
	ip, err := netip.ParseAddr(host)
	if err != nil {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast()
}

func firstForwardedFor(value string) string {
	for _, item := range strings.Split(value, ",") {
		candidate := strings.TrimSpace(item)
		if candidate == "" {
			continue
		}
		if ip, err := netip.ParseAddr(candidate); err == nil && ip.IsValid() {
			return candidate
		}
		if host := remoteHost(candidate); host != "" {
			if ip, err := netip.ParseAddr(host); err == nil && ip.IsValid() {
				return host
			}
		}
	}
	return ""
}

func remoteHost(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	host, _, err := net.SplitHostPort(trimmed)
	if err == nil && host != "" {
		return host
	}
	return trimmed
}

func contentTypeForFileName(name string) string {
	lower := strings.ToLower(name)
	switch {
	case strings.HasSuffix(lower, ".png"):
		return "image/png"
	case strings.HasSuffix(lower, ".webp"):
		return "image/webp"
	case strings.HasSuffix(lower, ".gif"):
		return "image/gif"
	default:
		return "image/jpeg"
	}
}

func parseOptionalRFC3339(value *string, fieldName string) (*time.Time, error) {
	if value == nil || *value == "" {
		return nil, nil
	}
	parsed, err := time.Parse(time.RFC3339, *value)
	if err != nil {
		return nil, errors.New(fieldName + " must be RFC3339")
	}
	return &parsed, nil
}

func parseRequiredRFC3339(value string, fieldName string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, errors.New(fieldName + " must be RFC3339")
	}
	return parsed, nil
}

func detectMultipartContentType(file multipartFile) (string, error) {
	header := make([]byte, 512)
	n, err := io.ReadFull(file, header)
	if err != nil && err != io.EOF && err != io.ErrUnexpectedEOF {
		return "", err
	}
	if _, seekErr := file.Seek(0, io.SeekStart); seekErr != nil {
		return "", seekErr
	}
	if n <= 0 {
		return "", nil
	}
	return normalizedMediaType(http.DetectContentType(header[:n])), nil
}

func validateUploadType(file multipartFile, fileName string, allowed func(string, string) bool, publicError string) error {
	detected, err := detectMultipartContentType(file)
	if err != nil {
		return err
	}
	if allowed(detected, fileName) {
		return nil
	}
	if publicError == "" {
		publicError = "unsupported file type"
	}
	return errors.New(publicError)
}

func allowAvatarUploadType(detected, _ string) bool {
	switch detected {
	case "image/jpeg", "image/png", "image/gif":
		return true
	default:
		return false
	}
}

func allowMediaUploadType(detected, fileName string) bool {
	switch detected {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/quicktime":
		return true
	}
	extensionType := normalizedMediaType(mediaTypeForFileExtension(fileName))
	switch extensionType {
	case "image/heic", "image/heif":
		return detected == "" || detected == "application/octet-stream"
	default:
		return false
	}
}

func normalizeOrigins(items []string) []string {
	seen := make(map[string]struct{}, len(items))
	origins := make([]string, 0, len(items))
	for _, item := range items {
		normalized := strings.TrimRight(strings.TrimSpace(item), "/")
		if normalized == "" {
			continue
		}
		key := strings.ToLower(normalized)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		origins = append(origins, normalized)
	}
	return origins
}

func (s *Server) allowedOrigin(origin string) (string, bool) {
	normalized := strings.TrimRight(strings.TrimSpace(origin), "/")
	for _, item := range s.allowedOrigins {
		if strings.EqualFold(item, normalized) {
			return origin, true
		}
	}
	return "", false
}

func splitPath(path string) []string {
	if path == "" {
		return nil
	}
	return strings.Split(path, "/")
}

func writeMethodNotAllowed(w http.ResponseWriter) {
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func writeStoreError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrUnauthorized):
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
	case errors.Is(err, store.ErrForbidden):
		writeJSON(w, http.StatusForbidden, map[string]string{"error": err.Error()})
	case errors.Is(err, store.ErrNodeUnauthorized):
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": err.Error()})
	case errors.Is(err, store.ErrPairingNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
	case errors.Is(err, store.ErrPairingExpired):
		writeJSON(w, http.StatusGone, map[string]string{"error": err.Error()})
	case errors.Is(err, store.ErrPairingUsed):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	case errors.Is(err, store.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
	case errors.Is(err, store.ErrConflict):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
}

func writeLoggedError(r *http.Request, w http.ResponseWriter, status int, publicError, logMessage string, err error, fields map[string]any) {
	if strings.TrimSpace(logMessage) != "" {
		logFields := make(map[string]any, len(fields)+2)
		for key, value := range fields {
			logFields[key] = value
		}
		logFields["status"] = status
		if err != nil {
			logFields["error"] = err.Error()
		}
		level := "warn"
		if status >= 500 {
			level = "error"
		}
		logRequestEvent(r, level, logMessage, logFields)
	}
	writeJSON(w, status, map[string]string{"error": publicError})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	if w.Header().Get("Cache-Control") == "" {
		w.Header().Set("Cache-Control", "private, no-store")
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func etagMatches(r *http.Request, etag string) bool {
	if strings.TrimSpace(etag) == "" {
		return false
	}
	for _, item := range strings.Split(r.Header.Get("If-None-Match"), ",") {
		if strings.TrimSpace(item) == etag || strings.TrimSpace(item) == "*" {
			return true
		}
	}
	return false
}

func modifiedSince(r *http.Request, lastModified time.Time) bool {
	if lastModified.IsZero() {
		return false
	}
	value := strings.TrimSpace(r.Header.Get("If-Modified-Since"))
	if value == "" {
		return false
	}
	parsed, err := http.ParseTime(value)
	if err != nil {
		return false
	}
	return !lastModified.After(parsed)
}

type multipartFile = multipart.File
type multipartHeader = multipart.FileHeader
