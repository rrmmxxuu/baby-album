package httpapi

import (
	"context"
	"net/http"
	"net/netip"
	"path/filepath"
	"strings"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/objectstore"
	"babyalbum/api/internal/r2cache"
	"babyalbum/api/internal/store"
)

type Options struct {
	MaxUploadBytes            int64
	AllowedOrigins            []string
	TrustedProxyCIDRs         []string
	PublicBaseURL             string
	MediaURLSigningSecret     string
	LocalStorageMaxBytes      int64
	LocalStorageTargetBytes   int64
	LocalOriginalMinRetention time.Duration
	LocalMaintenanceInterval  time.Duration
	R2Config                  r2cache.Config
	R2LocalRoot               string
	R2MaxBytes                int64
	R2TargetBytes             int64
	R2ClassASoftLimit         int64
	R2ClassBSoftLimit         int64
}

type Server struct {
	store           store.Repository
	mediaStore      mediaStateStore
	blob            *blob.Storage
	maxUploadBytes  int64
	allowedOrigins  []string
	trustedProxies  []netip.Prefix
	publicBaseURL   string
	signingSecret   []byte
	screenPreviews  objectstore.Store
	cacheController *mediaCacheController
	agentJobHub     *agentJobHub
	timerHub        *feedingTimerHub
	requestLimits   *requestRateLimiter
	mux             *http.ServeMux
}

func NewServer(repo store.Repository, blobStorage *blob.Storage, maxUploadBytes int64, allowedOrigins []string) *Server {
	return NewServerWithOptions(repo, blobStorage, Options{
		MaxUploadBytes:        maxUploadBytes,
		AllowedOrigins:        allowedOrigins,
		PublicBaseURL:         "http://localhost:8080",
		MediaURLSigningSecret: "test-media-signing-secret",
	})
}

func NewServerWithOptions(repo store.Repository, blobStorage *blob.Storage, options Options) *Server {
	mediaStore, _ := repo.(mediaStateStore)
	s := &Server{
		store:          repo,
		mediaStore:     mediaStore,
		blob:           blobStorage,
		maxUploadBytes: options.MaxUploadBytes,
		allowedOrigins: normalizeOrigins(options.AllowedOrigins),
		trustedProxies: parseTrustedProxyCIDRs(options.TrustedProxyCIDRs),
		publicBaseURL:  strings.TrimRight(strings.TrimSpace(options.PublicBaseURL), "/"),
		signingSecret:  []byte(strings.TrimSpace(options.MediaURLSigningSecret)),
		agentJobHub:    newAgentJobHub(),
		timerHub:       newFeedingTimerHub(),
		requestLimits:  newRequestRateLimiter(),
		mux:            http.NewServeMux(),
	}
	if len(s.signingSecret) == 0 {
		s.signingSecret = []byte("test-media-signing-secret")
	}
	if s.publicBaseURL == "" {
		s.publicBaseURL = "http://localhost:8080"
	}
	r2Client := r2cache.New(options.R2Config)
	if r2Client.Enabled() {
		s.screenPreviews = objectstore.NewR2(r2Client)
	} else {
		localRoot := strings.TrimSpace(options.R2LocalRoot)
		if localRoot == "" {
			localRoot = filepath.Join(blobStorage.Root(), "screen-previews")
		}
		s.screenPreviews = objectstore.NewLocalFS(localRoot)
	}
	if mediaStore != nil {
		s.cacheController = newMediaCacheController(mediaStore, blobStorage, s.screenPreviews, options)
	}
	if notifierTarget, ok := repo.(interface{ SetAgentJobNotifier(store.AgentJobNotifier) }); ok {
		notifierTarget.SetAgentJobNotifier(s.agentJobHub.Publish)
	}
	s.routes()
	return s
}

func (s *Server) ListenAndServe(addr string) error {
	if s.cacheController != nil {
		go s.cacheController.Run()
	}
	server := &http.Server{
		Addr:              addr,
		Handler:           s.withMiddleware(s.mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      5 * time.Minute,
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}
	return server.ListenAndServe()
}

func (s *Server) applyDeleteCleanup(cleanup store.DeleteCleanup) {
	for _, key := range cleanup.LocalBlobKeys {
		if err := s.blob.Delete(key); err != nil {
			logEvent("warn", "delete local blob failed", map[string]any{
				"blob_key": key,
				"error":    err.Error(),
			})
		}
	}
	for _, key := range cleanup.ScreenPreviewObjectKeys {
		if s.screenPreviews == nil || !s.screenPreviews.Enabled() {
			continue
		}
		if err := s.screenPreviews.Delete(context.Background(), key); err != nil {
			logEvent("warn", "delete screen preview failed", map[string]any{
				"object_key": key,
				"error":      err.Error(),
			})
		}
	}
	if s.cacheController == nil {
		return
	}
	for _, key := range cleanup.WarmObjectKeys {
		if err := s.cacheController.DeleteWarmObject(context.Background(), key); err != nil {
			logEvent("warn", "delete warm object failed", map[string]any{
				"object_key": key,
				"error":      err.Error(),
			})
		}
	}
	s.cacheController.RunNow()
}
