package httpapi

import (
	"net/http"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/store"
)

type Server struct {
	store          store.Repository
	blob           *blob.Storage
	maxUploadBytes int64
	allowedOrigins []string
	mux            *http.ServeMux
}

func NewServer(repo store.Repository, blobStorage *blob.Storage, maxUploadBytes int64, allowedOrigins []string) *Server {
	s := &Server{
		store:          repo,
		blob:           blobStorage,
		maxUploadBytes: maxUploadBytes,
		allowedOrigins: normalizeOrigins(allowedOrigins),
		mux:            http.NewServeMux(),
	}
	s.routes()
	return s
}

func (s *Server) ListenAndServe(addr string) error {
	return http.ListenAndServe(addr, s.withMiddleware(s.mux))
}
