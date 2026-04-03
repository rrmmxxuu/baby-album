package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type LoggingOptions struct {
	Format string
	Color  string
	Level  string
}

type requestMetadata struct {
	requestID string
	albumID   string
	userID    string
	nodeID    string
}

type requestMetadataKey struct{}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

type logLevel int

const (
	logLevelDebug logLevel = iota
	logLevelInfo
	logLevelWarn
	logLevelError
)

type logFormat string

const (
	logFormatPretty logFormat = "pretty"
	logFormatJSON   logFormat = "json"
)

type logColorMode string

const (
	logColorAlways logColorMode = "always"
	logColorAuto   logColorMode = "auto"
	logColorNever  logColorMode = "never"
)

const (
	ansiReset  = "\x1b[0m"
	ansiDim    = "\x1b[90m"
	ansiBlue   = "\x1b[34m"
	ansiCyan   = "\x1b[36m"
	ansiYellow = "\x1b[33m"
	ansiRed    = "\x1b[31m"
	ansiGreen  = "\x1b[32m"
)

type logger struct {
	level  logLevel
	format logFormat
	color  logColorMode
	stdout io.Writer
	stderr io.Writer
	now    func() time.Time

	mu sync.Mutex
}

type loggerState struct {
	mu     sync.RWMutex
	active *logger
}

var globalLogger = &loggerState{
	active: newLogger(LoggingOptions{}, os.Stdout, os.Stderr, time.Now),
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

func ConfigureLogging(options LoggingOptions) {
	globalLogger.mu.Lock()
	globalLogger.active = newLogger(options, os.Stdout, os.Stderr, time.Now)
	globalLogger.mu.Unlock()
}

func LogDebug(message string, fields map[string]any) {
	logEvent("debug", message, fields)
}

func LogInfo(message string, fields map[string]any) {
	logEvent("info", message, fields)
}

func LogWarn(message string, fields map[string]any) {
	logEvent("warn", message, fields)
}

func LogError(message string, fields map[string]any) {
	logEvent("error", message, fields)
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

func setRequestNodeID(r *http.Request, nodeID string) {
	meta := requestMetadataFromContext(r)
	if meta == nil || nodeID == "" {
		return
	}
	meta.nodeID = nodeID
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
	currentLogger().log(parseLogLevel(level), strings.TrimSpace(message), fields)
}

func logRequestEvent(r *http.Request, level, message string, fields map[string]any) {
	logFields := requestLogFields(r)
	for key, value := range fields {
		logFields[key] = value
	}
	logEvent(level, message, logFields)
}

func requestSummaryLevel(status int) string {
	switch {
	case status >= 500:
		return "error"
	case status == http.StatusUnauthorized || status == http.StatusForbidden || status == http.StatusTooManyRequests:
		return "warn"
	default:
		return "info"
	}
}

func requestLogFields(r *http.Request) map[string]any {
	fields := map[string]any{}
	if r == nil {
		return fields
	}
	meta := requestMetadataFromContext(r)
	if meta != nil {
		if meta.requestID != "" {
			fields["request_id"] = meta.requestID
		}
		if meta.userID != "" {
			fields["user_id"] = meta.userID
		}
		if meta.albumID != "" {
			fields["album_id"] = meta.albumID
		}
		if meta.nodeID != "" {
			fields["node_id"] = meta.nodeID
		}
	}
	fields["method"] = r.Method
	fields["path"] = r.URL.Path
	if clientAddr := clientIP(r); clientAddr != "" {
		fields["client_ip"] = clientAddr
	}
	if remoteAddr := strings.TrimSpace(r.RemoteAddr); remoteAddr != "" {
		fields["remote_addr"] = remoteAddr
	}
	return fields
}

func currentLogger() *logger {
	globalLogger.mu.RLock()
	active := globalLogger.active
	globalLogger.mu.RUnlock()
	return active
}

func newLogger(options LoggingOptions, stdout, stderr io.Writer, now func() time.Time) *logger {
	if stdout == nil {
		stdout = os.Stdout
	}
	if stderr == nil {
		stderr = os.Stderr
	}
	if now == nil {
		now = time.Now
	}
	return &logger{
		level:  parseLogLevel(options.Level),
		format: parseLogFormat(options.Format),
		color:  parseLogColorMode(options.Color),
		stdout: stdout,
		stderr: stderr,
		now:    now,
	}
}

func (l *logger) log(level logLevel, message string, fields map[string]any) {
	if l == nil || message == "" || level < l.level {
		return
	}
	entry := logEntry{
		Timestamp: l.now().UTC(),
		Level:     level,
		Message:   message,
		Fields:    sanitizeLogFields(fields),
	}
	writer := l.writerFor(level)
	line := l.render(entry, writer)
	l.mu.Lock()
	defer l.mu.Unlock()
	_, _ = io.WriteString(writer, line+"\n")
}

func (l *logger) writerFor(level logLevel) io.Writer {
	if level >= logLevelError {
		return l.stderr
	}
	return l.stdout
}

func (l *logger) render(entry logEntry, writer io.Writer) string {
	switch l.format {
	case logFormatJSON:
		return l.renderJSON(entry)
	default:
		return l.renderPretty(entry, l.colorEnabled(writer))
	}
}

func (l *logger) renderJSON(entry logEntry) string {
	payload := map[string]any{
		"timestamp": entry.Timestamp.Format(time.RFC3339Nano),
		"level":     entry.Level.String(),
		"message":   entry.Message,
	}
	for key, value := range entry.Fields {
		payload[key] = value
	}
	data, err := json.Marshal(payload)
	if err != nil {
		fallback := map[string]any{
			"timestamp": entry.Timestamp.Format(time.RFC3339Nano),
			"level":     logLevelError.String(),
			"message":   "marshal log payload failed",
			"error":     err.Error(),
		}
		data, _ = json.Marshal(fallback)
	}
	return string(data)
}

func (l *logger) renderPretty(entry logEntry, colorEnabled bool) string {
	parts := []string{
		colorize(colorEnabled, ansiDim, entry.Timestamp.Format(time.RFC3339Nano)),
		colorize(colorEnabled, entry.Level.colorCode(), entry.Level.pretty()),
		entry.Message,
	}
	for _, key := range orderedLogKeys(entry.Fields) {
		parts = append(parts, formatPrettyField(colorEnabled, key, entry.Fields[key]))
	}
	return strings.Join(parts, " ")
}

func (l *logger) colorEnabled(writer io.Writer) bool {
	switch l.color {
	case logColorAlways:
		return true
	case logColorNever:
		return false
	default:
		file, ok := writer.(*os.File)
		if !ok {
			return false
		}
		info, err := file.Stat()
		if err != nil {
			return false
		}
		return info.Mode()&os.ModeCharDevice != 0
	}
}

func parseLogLevel(value string) logLevel {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "debug":
		return logLevelDebug
	case "warn", "warning":
		return logLevelWarn
	case "error":
		return logLevelError
	default:
		return logLevelInfo
	}
}

func parseLogFormat(value string) logFormat {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "json":
		return logFormatJSON
	default:
		return logFormatPretty
	}
}

func parseLogColorMode(value string) logColorMode {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "never", "false", "0":
		return logColorNever
	case "auto":
		return logColorAuto
	default:
		return logColorAlways
	}
}

func (l logLevel) String() string {
	switch l {
	case logLevelDebug:
		return "debug"
	case logLevelWarn:
		return "warn"
	case logLevelError:
		return "error"
	default:
		return "info"
	}
}

func (l logLevel) pretty() string {
	return strings.ToUpper(l.String())
}

func (l logLevel) colorCode() string {
	switch l {
	case logLevelDebug:
		return ansiCyan
	case logLevelWarn:
		return ansiYellow
	case logLevelError:
		return ansiRed
	default:
		return ansiBlue
	}
}

type logEntry struct {
	Timestamp time.Time
	Level     logLevel
	Message   string
	Fields    map[string]any
}

func sanitizeLogFields(fields map[string]any) map[string]any {
	if len(fields) == 0 {
		return map[string]any{}
	}
	sanitized := make(map[string]any, len(fields))
	for key, value := range fields {
		if value == nil {
			continue
		}
		sanitized[key] = sanitizeLogValue(strings.ToLower(strings.TrimSpace(key)), value)
	}
	return sanitized
}

func sanitizeLogValue(key string, value any) any {
	if isSensitiveLogKey(key) {
		return "[REDACTED]"
	}
	switch typed := value.(type) {
	case error:
		return sanitizeStringValue(key, typed.Error())
	case fmt.Stringer:
		return sanitizeStringValue(key, typed.String())
	case string:
		return sanitizeStringValue(key, typed)
	case []string:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, sanitizeStringValue(key, item))
		}
		return items
	case []any:
		items := make([]any, 0, len(typed))
		for _, item := range typed {
			items = append(items, sanitizeLogValue(key, item))
		}
		return items
	case map[string]any:
		items := make(map[string]any, len(typed))
		for nestedKey, nestedValue := range typed {
			items[nestedKey] = sanitizeLogValue(strings.ToLower(strings.TrimSpace(nestedKey)), nestedValue)
		}
		return items
	case map[string]string:
		items := make(map[string]any, len(typed))
		for nestedKey, nestedValue := range typed {
			items[nestedKey] = sanitizeLogValue(strings.ToLower(strings.TrimSpace(nestedKey)), nestedValue)
		}
		return items
	default:
		return value
	}
}

func sanitizeStringValue(key, value string) string {
	if isSensitiveLogKey(key) {
		return "[REDACTED]"
	}
	if redacted := redactSensitiveURLQuery(value); redacted != value {
		return redacted
	}
	return value
}

func isSensitiveLogKey(key string) bool {
	if key == "" {
		return false
	}
	switch key {
	case "authorization", "cookie", "set-cookie", "set_cookie", "x-node-token", "node_token", "password", "sig":
		return true
	}
	return strings.Contains(key, "token") ||
		strings.Contains(key, "secret") ||
		strings.Contains(key, "password") ||
		strings.Contains(key, "cookie") ||
		strings.Contains(key, "access_key") ||
		strings.Contains(key, "signing") ||
		strings.Contains(key, "invite_code") ||
		strings.Contains(key, "pairing_code")
}

func redactSensitiveURLQuery(value string) string {
	if !strings.Contains(value, "?") {
		return value
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.RawQuery == "" {
		return value
	}
	query := parsed.Query()
	changed := false
	for key := range query {
		if isSensitiveQueryKey(key) {
			query.Set(key, "[REDACTED]")
			changed = true
		}
	}
	if !changed {
		return value
	}
	parsed.RawQuery = query.Encode()
	return parsed.String()
}

func isSensitiveQueryKey(key string) bool {
	key = strings.ToLower(strings.TrimSpace(key))
	switch key {
	case "sig", "token", "authorization":
		return true
	}
	return strings.Contains(key, "token") || strings.Contains(key, "sig")
}

func orderedLogKeys(fields map[string]any) []string {
	keys := make([]string, 0, len(fields))
	for key := range fields {
		keys = append(keys, key)
	}
	priority := map[string]int{
		"request_id":  0,
		"method":      1,
		"path":        2,
		"status":      3,
		"duration_ms": 4,
		"user_id":     5,
		"album_id":    6,
		"node_id":     7,
		"media_id":    8,
		"job_id":      9,
		"blob_key":    10,
		"file_name":   11,
		"error":       12,
	}
	sort.Slice(keys, func(i, j int) bool {
		leftPriority, leftOK := priority[keys[i]]
		rightPriority, rightOK := priority[keys[j]]
		switch {
		case leftOK && rightOK:
			if leftPriority != rightPriority {
				return leftPriority < rightPriority
			}
		case leftOK:
			return true
		case rightOK:
			return false
		}
		return keys[i] < keys[j]
	})
	return keys
}

func formatPrettyField(colorEnabled bool, key string, value any) string {
	formatted := formatPrettyValue(value)
	if key == "status" {
		if status, ok := numericStatus(value); ok {
			formatted = colorize(colorEnabled, statusColorCode(status), formatted)
		}
	}
	return key + "=" + formatted
}

func formatPrettyValue(value any) string {
	switch typed := value.(type) {
	case string:
		if typed == "" {
			return `""`
		}
		if strings.ContainsAny(typed, " \t\n\r\"=") {
			return strconv.Quote(typed)
		}
		return typed
	case time.Time:
		return typed.UTC().Format(time.RFC3339Nano)
	case fmt.Stringer:
		return formatPrettyValue(typed.String())
	case []any, []string, map[string]any, map[string]string:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return strconv.Quote(fmt.Sprintf("%v", typed))
		}
		return string(encoded)
	default:
		return fmt.Sprintf("%v", typed)
	}
}

func numericStatus(value any) (int, bool) {
	switch typed := value.(type) {
	case int:
		return typed, true
	case int64:
		return int(typed), true
	case float64:
		return int(typed), true
	case json.Number:
		parsed, err := typed.Int64()
		return int(parsed), err == nil
	case string:
		parsed, err := strconv.Atoi(strings.TrimSpace(typed))
		return parsed, err == nil
	default:
		return 0, false
	}
}

func statusColorCode(status int) string {
	switch {
	case status >= 500:
		return ansiRed
	case status >= 400:
		return ansiYellow
	case status >= 300:
		return ansiCyan
	case status >= 200:
		return ansiGreen
	default:
		return ansiBlue
	}
}

func colorize(enabled bool, code, value string) string {
	if !enabled || code == "" || value == "" {
		return value
	}
	return code + value + ansiReset
}

func swapLoggerForTest(next *logger) func() {
	globalLogger.mu.Lock()
	previous := globalLogger.active
	globalLogger.active = next
	globalLogger.mu.Unlock()
	return func() {
		globalLogger.mu.Lock()
		globalLogger.active = previous
		globalLogger.mu.Unlock()
	}
}
