package main

import (
	"bufio"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/httpapi"
	"babyalbum/api/internal/store"
)

func main() {
	loadDotEnv(".env")
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
	server := httpapi.NewServer(repository, blob.New(cacheRoot), maxUploadBytes, allowedOrigins)
	log.Printf("baby album api listening on %s cache=%s max_upload_mb=%d allowed_origins=%s", addr, cacheRoot, maxUploadBytes>>20, strings.Join(allowedOrigins, ","))
	if err := server.ListenAndServe(addr); err != nil {
		log.Fatal(err)
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
		if (key == "CACHE_ROOT" || key == "SPOOL_ROOT") && value != "" && !filepath.IsAbs(value) {
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
		log.Fatal("DATABASE_URL is required")
	}
	postgresStore, err := store.NewPostgresStore(databaseURL)
	if err != nil {
		log.Fatalf("initialize postgres store: %v", err)
	}
	log.Print("using PostgreSQL store")
	return postgresStore, func() {
		if err := postgresStore.Close(); err != nil {
			log.Printf("close postgres store: %v", err)
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
