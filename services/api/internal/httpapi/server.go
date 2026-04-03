package httpapi

import (
	"context"
	"net/http"
	"strings"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/r2cache"
	"babyalbum/api/internal/store"
)

type Options struct {
	MaxUploadBytes            int64
	AllowedOrigins            []string
	PublicBaseURL             string
	MediaURLSigningSecret     string
	LocalStorageMaxBytes      int64
	LocalStorageTargetBytes   int64
	LocalOriginalMinRetention time.Duration
	LocalMaintenanceInterval  time.Duration
	R2Config                  r2cache.Config
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
	publicBaseURL   string
	signingSecret   []byte
	cacheController *mediaCacheController
	agentJobHub     *agentJobHub
	timerHub        *feedingTimerHub
	mux             *http.ServeMux
}

func NewServer(repo store.Repository, blobStorage *blob.Storage, maxUploadBytes int64, allowedOrigins []string) *Server {
	return NewServerWithOptions(repo, blobStorage, Options{
		MaxUploadBytes:        maxUploadBytes,
		AllowedOrigins:        allowedOrigins,
		PublicBaseURL:         "http://localhost:8080",
		MediaURLSigningSecret: "dev-media-secret",
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
		publicBaseURL:  strings.TrimRight(strings.TrimSpace(options.PublicBaseURL), "/"),
		signingSecret:  []byte(strings.TrimSpace(options.MediaURLSigningSecret)),
		agentJobHub:    newAgentJobHub(),
		timerHub:       newFeedingTimerHub(),
		mux:            http.NewServeMux(),
	}
	if len(s.signingSecret) == 0 {
		s.signingSecret = []byte("dev-media-secret")
	}
	if s.publicBaseURL == "" {
		s.publicBaseURL = "http://localhost:8080"
	}
	if mediaStore != nil {
		s.cacheController = newMediaCacheController(mediaStore, blobStorage, options)
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
	return http.ListenAndServe(addr, s.withMiddleware(s.mux))
}

func (s *Server) applyDeleteCleanup(cleanup store.DeleteCleanup) {
	for _, key := range cleanup.LocalBlobKeys {
		_ = s.blob.Delete(key)
	}
	if s.cacheController == nil {
		return
	}
	for _, key := range cleanup.WarmObjectKeys {
		_ = s.cacheController.DeleteWarmObject(context.Background(), key)
	}
	s.cacheController.RunNow()
}
