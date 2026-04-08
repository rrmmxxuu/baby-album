package httpapi

import (
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type requestRateLimiter struct {
	mu      sync.Mutex
	windows map[string]rateLimitWindow
}

type rateLimitWindow struct {
	count   int
	resetAt time.Time
}

func newRequestRateLimiter() *requestRateLimiter {
	return &requestRateLimiter{
		windows: make(map[string]rateLimitWindow),
	}
}

func (l *requestRateLimiter) allow(scope string, limit int, window time.Duration) (bool, time.Duration) {
	if l == nil || limit <= 0 || window <= 0 {
		return true, 0
	}
	now := time.Now().UTC()
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.windows) > 4096 {
		for key, item := range l.windows {
			if !item.resetAt.After(now) {
				delete(l.windows, key)
			}
		}
	}
	item, ok := l.windows[scope]
	if !ok || !item.resetAt.After(now) {
		l.windows[scope] = rateLimitWindow{
			count:   1,
			resetAt: now.Add(window),
		}
		return true, 0
	}
	if item.count >= limit {
		return false, item.resetAt.Sub(now)
	}
	item.count += 1
	l.windows[scope] = item
	return true, 0
}

func rateLimitScope(parts ...string) string {
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(strings.ToLower(part))
		if trimmed == "" {
			continue
		}
		items = append(items, trimmed)
	}
	return strings.Join(items, "|")
}

func writeRateLimitExceeded(w http.ResponseWriter, retryAfter time.Duration) {
	seconds := 1
	if retryAfter > 0 {
		seconds = int(math.Ceil(retryAfter.Seconds()))
		if seconds < 1 {
			seconds = 1
		}
	}
	w.Header().Set("Retry-After", strconv.Itoa(seconds))
	writeJSON(w, http.StatusTooManyRequests, map[string]string{"error": "rate limit exceeded"})
}
