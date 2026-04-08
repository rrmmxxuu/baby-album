package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/httpapi"
	"babyalbum/api/internal/r2cache"
	"babyalbum/api/internal/store"
)

func main() {
	loadDotEnv(".env")
	httpapi.ConfigureLogging(httpapi.LoggingOptions{
		Format: os.Getenv("LOG_FORMAT"),
		Color:  os.Getenv("LOG_COLOR"),
		Level:  os.Getenv("LOG_LEVEL"),
	})
	addr := os.Getenv("API_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	repository, cleanup := mustLoadRepository()
	defer cleanup()
	cacheRoot := os.Getenv("CACHE_ROOT")
	if cacheRoot == "" {
		cacheRoot = "tmp/cache"
	}
	maxUploadBytes := int64(512 << 20)
	if raw := os.Getenv("MAX_UPLOAD_MB"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			maxUploadBytes = int64(parsed) << 20
		}
	}
	allowedOrigins := parseAllowedOrigins(os.Getenv("ALLOWED_ORIGINS"))
	if err := validateAllowedOrigins(allowedOrigins); err != nil {
		httpapi.LogError("ALLOWED_ORIGINS is invalid", map[string]any{"error": err.Error()})
		os.Exit(1)
	}
	signingSecret, err := requiredMediaURLSigningSecret()
	if err != nil {
		httpapi.LogError("MEDIA_URL_SIGNING_SECRET is invalid", map[string]any{"error": err.Error()})
		os.Exit(1)
	}
	server := httpapi.NewServerWithOptions(repository, blob.New(cacheRoot), httpapi.Options{
		MaxUploadBytes:            maxUploadBytes,
		AllowedOrigins:            allowedOrigins,
		PublicBaseURL:             firstNonEmpty(os.Getenv("PUBLIC_API_BASE_URL"), "http://localhost:8080"),
		MediaURLSigningSecret:     signingSecret,
		LocalStorageMaxBytes:      parseByteEnv("BLOB_STORAGE_MAX_GB", 50),
		LocalStorageTargetBytes:   parseByteEnv("BLOB_STORAGE_TARGET_GB", 35),
		LocalOriginalMinRetention: time.Duration(parseIntEnv("ORIGINAL_HOT_MIN_RETENTION_DAYS", 30)) * 24 * time.Hour,
		LocalMaintenanceInterval:  time.Duration(parseIntEnv("BLOB_MAINTENANCE_INTERVAL_MINUTES", 15)) * time.Minute,
		R2Config: r2cache.Config{
			AccountID:       os.Getenv("R2_ACCOUNT_ID"),
			Endpoint:        os.Getenv("R2_ENDPOINT"),
			Bucket:          os.Getenv("R2_BUCKET"),
			AccessKeyID:     os.Getenv("R2_ACCESS_KEY_ID"),
			SecretAccessKey: os.Getenv("R2_SECRET_ACCESS_KEY"),
			Region:          firstNonEmpty(os.Getenv("R2_REGION"), "auto"),
		},
		R2LocalRoot:       firstNonEmpty(os.Getenv("R2_LOCAL_ROOT"), "tmp/r2"),
		R2MaxBytes:        parseByteEnv("R2_MAX_GB", 8),
		R2TargetBytes:     parseByteEnv("R2_TARGET_GB", 6),
		R2ClassASoftLimit: int64(parseIntEnv("R2_CLASS_A_SOFT_LIMIT", 800000)),
		R2ClassBSoftLimit: int64(parseIntEnv("R2_CLASS_B_SOFT_LIMIT", 8000000)),
	})
	httpapi.LogInfo("baby album api listening", map[string]any{
		"addr":            addr,
		"cache_root":      cacheRoot,
		"max_upload_mb":   maxUploadBytes >> 20,
		"allowed_origins": allowedOrigins,
		"log_format":      firstNonEmpty(os.Getenv("LOG_FORMAT"), "pretty"),
		"log_color":       firstNonEmpty(os.Getenv("LOG_COLOR"), "always"),
		"log_level":       firstNonEmpty(os.Getenv("LOG_LEVEL"), "info"),
	})
	if err := server.ListenAndServe(addr); err != nil {
		httpapi.LogError("api server exited", map[string]any{"error": err.Error()})
		os.Exit(1)
	}
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		value = strings.TrimSpace(value)
		value = strings.Trim(value, `"'`)
		if (key == "CACHE_ROOT" || key == "SPOOL_ROOT" || key == "R2_LOCAL_ROOT") && value != "" && !filepath.IsAbs(value) {
			value = filepath.Clean(filepath.Join(filepath.Dir(path), value))
		}
		if err := os.Setenv(key, value); err != nil {
			log.Printf("set env %s from %s: %v", key, path, err)
		}
	}
	if err := scanner.Err(); err != nil {
		log.Printf("read %s: %v", path, err)
	}
}

func mustLoadRepository() (store.Repository, func()) {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		httpapi.LogError("DATABASE_URL is required", nil)
		os.Exit(1)
	}
	postgresStore, err := store.NewPostgresStore(databaseURL)
	if err != nil {
		httpapi.LogError("initialize postgres store failed", map[string]any{"error": err.Error()})
		os.Exit(1)
	}
	httpapi.LogInfo("using PostgreSQL store", nil)
	return postgresStore, func() {
		if err := postgresStore.Close(); err != nil {
			httpapi.LogWarn("close postgres store failed", map[string]any{"error": err.Error()})
		}
	}
}

func parseAllowedOrigins(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{"http://localhost:3000", "http://127.0.0.1:3000"}
	}
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		if value := strings.TrimSpace(part); value != "" {
			origins = append(origins, value)
		}
	}
	if len(origins) == 0 {
		return []string{"http://localhost:3000", "http://127.0.0.1:3000"}
	}
	return origins
}

func validateAllowedOrigins(origins []string) error {
	if len(origins) == 0 {
		return nil
	}
	for _, origin := range origins {
		if strings.TrimSpace(origin) == "*" {
			return fmt.Errorf("wildcard origins are not allowed")
		}
	}
	return nil
}

func requiredMediaURLSigningSecret() (string, error) {
	value := strings.TrimSpace(os.Getenv("MEDIA_URL_SIGNING_SECRET"))
	if value == "" {
		return "", fmt.Errorf("MEDIA_URL_SIGNING_SECRET is required")
	}
	switch strings.ToLower(value) {
	case "dev-media-secret", "replace-me", "replace-with-a-long-random-secret", "replace-me-with-a-long-random-secret", "replace_with_a_long_random_secret":
		return "", fmt.Errorf("MEDIA_URL_SIGNING_SECRET must be replaced with a long random value")
	}
	return value, nil
}

func parseIntEnv(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func parseByteEnv(key string, fallbackGiB int) int64 {
	return int64(parseIntEnv(key, fallbackGiB)) << 30
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
