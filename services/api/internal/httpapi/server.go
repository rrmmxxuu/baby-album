package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"babyalbum/api/internal/blob"
	"babyalbum/api/internal/domain"
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
	s := &Server{store: repo, blob: blobStorage, maxUploadBytes: maxUploadBytes, allowedOrigins: normalizeOrigins(allowedOrigins), mux: http.NewServeMux()}
	s.routes()
	return s
}

func (s *Server) ListenAndServe(addr string) error {
	return http.ListenAndServe(addr, s.withMiddleware(s.mux))
}

func (s *Server) routes() {
	s.mux.HandleFunc("/healthz", s.handleHealth)
	s.mux.HandleFunc("/api/v1/healthz", s.handleHealth)
	s.mux.HandleFunc("/api/v1/auth/register", s.handleAuthRegister)
	s.mux.HandleFunc("/api/v1/auth/login", s.handleAuthLogin)
	s.mux.HandleFunc("/api/v1/auth/logout", s.handleAuthLogout)
	s.mux.HandleFunc("/api/v1/auth/app", s.handleAuthApp)
	s.mux.HandleFunc("/api/v1/families", s.handleFamilies)
	s.mux.HandleFunc("/api/v1/families/", s.handleFamilyActions)
	s.mux.HandleFunc("/api/v1/invites/", s.handleInviteActions)
	s.mux.HandleFunc("/api/v1/bootstrap", s.handleBootstrap)
	s.mux.HandleFunc("/api/v1/timeline", s.handleTimeline)
	s.mux.HandleFunc("/api/v1/members", s.handleMembers)
	s.mux.HandleFunc("/api/v1/upload-sessions", s.handleUploadSessions)
	s.mux.HandleFunc("/api/v1/upload-sessions/", s.handleUploadSessionActions)
	s.mux.HandleFunc("/api/v1/media/", s.handleMediaActions)
	s.mux.HandleFunc("/api/v1/storage-nodes/register", s.handleNodeRegister)
	s.mux.HandleFunc("/api/v1/storage-nodes/heartbeat", s.handleNodeHeartbeat)
	s.mux.HandleFunc("/api/v1/agents/jobs", s.handleAgentJobs)
	s.mux.HandleFunc("/api/v1/agents/jobs/", s.handleAgentJobActions)
}

func (s *Server) withMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			w.Header().Add("Vary", "Origin")
			allowedOrigin, ok := s.allowedOrigin(origin)
			if !ok {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "origin not allowed"})
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-ID, X-Node-Token")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(start))
	})
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) handleAuthRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		DisplayName string `json:"displayName"`
		Email       string `json:"email"`
		Password    string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	result, err := s.store.RegisterUser(store.RegisterUserInput{DisplayName: input.DisplayName, Email: input.Email, Password: input.Password})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (s *Server) handleAuthLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	result, err := s.store.Login(store.LoginInput{Email: input.Email, Password: input.Password})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleAuthLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	token := bearerToken(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": store.ErrUnauthorized.Error()})
		return
	}
	if err := s.store.RevokeSession(token); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (s *Server) handleAuthApp(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	payload, err := s.store.AppState(userID, familyID(r))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) handleFamilies(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	var input struct {
		Name     string `json:"name"`
		Timezone string `json:"timezone"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	family, err := s.store.CreateFamily(userID, store.CreateFamilyInput{Name: input.Name, Timezone: input.Timezone})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, family)
}

func (s *Server) handleFamilyActions(w http.ResponseWriter, r *http.Request) {
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/families/"), "/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	familyID := parts[0]
	switch {
	case len(parts) == 2 && parts[1] == "babies":
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		var input struct {
			Name      string  `json:"name"`
			BirthDate *string `json:"birthDate"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		var birthDate *time.Time
		if input.BirthDate != nil && *input.BirthDate != "" {
			value, err := time.Parse(time.RFC3339, *input.BirthDate)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "birthDate must be RFC3339"})
				return
			}
			birthDate = &value
		}
		baby, err := s.store.CreateBaby(userID, store.CreateBabyInput{FamilyID: familyID, Name: input.Name, BirthDate: birthDate})
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, baby)
		return
	case len(parts) == 3 && parts[1] == "babies":
		if r.Method != http.MethodDelete {
			writeMethodNotAllowed(w)
			return
		}
		if err := s.store.DeleteBaby(userID, familyID, parts[2]); err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
		return
	case len(parts) == 2 && parts[1] == "leave":
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		var input struct {
			TransferOwnerTo string `json:"transferOwnerTo"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil && !errors.Is(err, io.EOF) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		if err := s.store.LeaveFamily(userID, store.LeaveFamilyInput{FamilyID: familyID, TransferOwnerTo: input.TransferOwnerTo}); err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "left"})
		return
	case len(parts) == 2 && parts[1] == "invites":
		s.handleFamilyInvites(w, r, userID, familyID)
		return
	case len(parts) == 4 && parts[1] == "members" && parts[3] == "role":
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		var input struct {
			Role string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		member, err := s.store.UpdateMemberRole(userID, store.UpdateMemberRoleInput{FamilyID: familyID, MemberUserID: parts[2], Role: domain.Role(input.Role)})
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, member)
		return
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (s *Server) handleFamilyInvites(w http.ResponseWriter, r *http.Request, userID, familyID string) {
	switch r.Method {
	case http.MethodGet:
		items, err := s.store.Invites(familyID, userID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	case http.MethodPost:
		var input struct {
			Role string `json:"role"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		invite, err := s.store.CreateInvite(userID, store.CreateInviteInput{FamilyID: familyID, Role: domain.Role(input.Role)})
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, invite)
	default:
		writeMethodNotAllowed(w)
	}
}

func (s *Server) handleInviteActions(w http.ResponseWriter, r *http.Request) {
	path := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/invites/"), "/")
	parts := strings.Split(path, "/")
	if len(parts) < 1 || parts[0] == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	code := parts[0]
	if len(parts) == 1 {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w)
			return
		}
		invite, err := s.store.InviteByCode(code)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, invite)
		return
	}
	if len(parts) == 2 && parts[1] == "accept" {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		userID, err := s.actorID(r)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		invite, err := s.store.AcceptInvite(userID, code)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, invite)
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func (s *Server) handleBootstrap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	payload, err := s.store.Bootstrap(familyID(r), userID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, payload)
}

func (s *Server) handleTimeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	payload, err := s.store.Timeline(familyID(r), userID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": payload})
}

func (s *Server) handleMembers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	payload, err := s.store.Members(familyID(r), userID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": payload})
}

func (s *Server) handleUploadSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	var input struct {
		FamilyID   string  `json:"familyId"`
		FileName   string  `json:"fileName"`
		MediaType  string  `json:"mediaType"`
		CapturedAt *string `json:"capturedAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	var capturedAt *time.Time
	if input.CapturedAt != nil && *input.CapturedAt != "" {
		value, err := time.Parse(time.RFC3339, *input.CapturedAt)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "capturedAt must be RFC3339"})
			return
		}
		capturedAt = &value
	}
	session, err := s.store.CreateUploadSession(userID, store.UploadSessionInput{FamilyID: input.FamilyID, FileName: input.FileName, MediaType: input.MediaType, CapturedAt: capturedAt})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (s *Server) handleUploadSessionActions(w http.ResponseWriter, r *http.Request) {
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/upload-sessions/")
	if !strings.HasSuffix(path, "/content") {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	sessionID := strings.TrimSuffix(strings.TrimSuffix(path, "/content"), "/")
	if sessionID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "session id is required"})
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, s.maxUploadBytes)
	if err := r.ParseMultipartForm(s.maxUploadBytes); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid multipart upload: %v", err)})
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file field is required"})
		return
	}
	defer file.Close()
	saved, err := s.blob.Save(sessionID, header.Filename, file)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	session, err := s.store.AttachUploadContent(userID, sessionID, store.UploadContentInput{ByteSize: saved.ByteSize, BlobKey: saved.Key})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleMediaActions(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/media/")
	if !strings.HasSuffix(path, "/preview") {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	mediaID := strings.TrimSuffix(strings.TrimSuffix(path, "/preview"), "/")
	if mediaID == "" || familyID(r) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "media id and familyId are required"})
		return
	}
	item, err := s.store.MediaByID(familyID(r), userID, mediaID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if item.PreviewStatus != domain.PreviewReady || item.PreviewBlobKey == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "preview not available"})
		return
	}
	blobFile, err := s.blob.Open(item.PreviewBlobKey)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	defer blobFile.Close()
	w.Header().Set("Content-Type", "image/jpeg")
	http.ServeContent(w, r, filepath.Base(item.FileName)+"-preview.jpg", time.Time{}, blobFile)
}

func (s *Server) handleNodeRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		NodeID string `json:"nodeId"`
		Name   string `json:"name"`
		Token  string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	node, err := s.store.RegisterStorageNode(input.NodeID, input.Name, input.Token)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleNodeHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		NodeID string `json:"nodeId"`
		Token  string `json:"token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	node, err := s.store.HeartbeatStorageNode(input.NodeID, input.Token)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleAgentJobs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	nodeID := r.URL.Query().Get("nodeId")
	if nodeID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nodeId is required"})
		return
	}
	jobs, err := s.store.PendingJobs(nodeID, r.Header.Get("X-Node-Token"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": jobs})
}

func (s *Server) handleAgentJobActions(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/agents/jobs/")
	jobID := strings.TrimSuffix(strings.TrimSuffix(strings.TrimSuffix(strings.TrimSuffix(path, "/complete"), "/blob"), "/preview"), "/")
	if jobID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "job id is required"})
		return
	}
	nodeToken := r.Header.Get("X-Node-Token")
	nodeID := r.URL.Query().Get("nodeId")
	if strings.HasSuffix(path, "/blob") {
		if r.Method != http.MethodGet {
			writeMethodNotAllowed(w)
			return
		}
		if nodeID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nodeId is required"})
			return
		}
		job, err := s.store.AgentJob(nodeID, nodeToken, jobID)
		if err != nil {
			writeStoreError(w, err)
			return
		}
		blobFile, err := s.blob.Open(job.BlobKey)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		defer blobFile.Close()
		w.Header().Set("Content-Type", job.MediaType)
		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filepath.Base(job.FileName)))
		http.ServeContent(w, r, job.FileName, time.Time{}, blobFile)
		return
	}
	if strings.HasSuffix(path, "/preview") {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		if nodeID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nodeId is required"})
			return
		}
		if _, err := s.store.AgentJob(nodeID, nodeToken, jobID); err != nil {
			writeStoreError(w, err)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, s.maxUploadBytes)
		if err := r.ParseMultipartForm(s.maxUploadBytes); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("invalid multipart upload: %v", err)})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "file field is required"})
			return
		}
		defer file.Close()
		saved, err := s.blob.Save(jobID+"-preview", header.Filename, file)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"blobKey": saved.Key, "byteSize": saved.ByteSize})
		return
	}
	if strings.HasSuffix(path, "/complete") {
		if r.Method != http.MethodPost {
			writeMethodNotAllowed(w)
			return
		}
		var input struct {
			NodeID string `json:"nodeId"`
			Report struct {
				OriginalPath   string `json:"originalPath"`
				PreviewBlobKey string `json:"previewBlobKey"`
				Width          int    `json:"width"`
				Height         int    `json:"height"`
				PreviewStatus  string `json:"previewStatus"`
			} `json:"report"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		previewStatus := domain.PreviewStatus(input.Report.PreviewStatus)
		if previewStatus == "" {
			previewStatus = domain.PreviewUnavailable
		}
		job, err := s.store.CompleteJob(input.NodeID, nodeToken, jobID, store.JobCompletionInput{OriginalPath: input.Report.OriginalPath, PreviewBlobKey: input.Report.PreviewBlobKey, Width: input.Report.Width, Height: input.Report.Height, PreviewStatus: previewStatus, ProcessedAt: time.Now().UTC()})
		if err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, job)
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
}

func (s *Server) actorID(r *http.Request) (string, error) {
	if token := bearerToken(r); token != "" {
		user, err := s.store.SessionUser(token)
		if err != nil {
			return "", err
		}
		return user.ID, nil
	}
	if value := r.Header.Get("X-User-ID"); value != "" {
		return value, nil
	}
	if value := r.URL.Query().Get("userId"); value != "" {
		return value, nil
	}
	return "", store.ErrUnauthorized
}

func bearerToken(r *http.Request) string {
	value := strings.TrimSpace(r.Header.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(value), "bearer ") {
		return strings.TrimSpace(value[7:])
	}
	if query := strings.TrimSpace(r.URL.Query().Get("token")); query != "" {
		return query
	}
	return ""
}

func familyID(r *http.Request) string {
	return r.URL.Query().Get("familyId")
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
		if item == "*" {
			return "*", true
		}
		if strings.EqualFold(item, normalized) {
			return origin, true
		}
	}
	return "", false
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
	case errors.Is(err, store.ErrNotFound):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
	case errors.Is(err, store.ErrConflict):
		writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
