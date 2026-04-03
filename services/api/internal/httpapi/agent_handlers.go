package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

func (s *Server) handleNodeRegister(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		NodeID      string `json:"nodeId"`
		Name        string `json:"name"`
		Token       string `json:"token"`
		PairingCode string `json:"pairingCode"`
		Capacity    struct {
			TotalBytes     int64 `json:"totalBytes"`
			FreeBytes      int64 `json:"freeBytes"`
			AvailableBytes int64 `json:"availableBytes"`
		} `json:"capacity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	setRequestNodeID(r, input.NodeID)
	result, err := s.store.RegisterStorageNode(store.StorageNodeRegisterInput{
		NodeID:      input.NodeID,
		NodeName:    input.Name,
		Token:       input.Token,
		PairingCode: input.PairingCode,
		Capacity: store.StorageCapacityReport{
			TotalBytes:     input.Capacity.TotalBytes,
			FreeBytes:      input.Capacity.FreeBytes,
			AvailableBytes: input.Capacity.AvailableBytes,
		},
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) handleNodeHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		NodeID   string `json:"nodeId"`
		Token    string `json:"token"`
		Capacity struct {
			TotalBytes     int64 `json:"totalBytes"`
			FreeBytes      int64 `json:"freeBytes"`
			AvailableBytes int64 `json:"availableBytes"`
		} `json:"capacity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	setRequestNodeID(r, input.NodeID)
	node, err := s.store.HeartbeatStorageNode(input.NodeID, input.Token, store.StorageCapacityReport{
		TotalBytes:     input.Capacity.TotalBytes,
		FreeBytes:      input.Capacity.FreeBytes,
		AvailableBytes: input.Capacity.AvailableBytes,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, node)
}

func (s *Server) handleNodeUnbind(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		NodeID string `json:"nodeId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	if strings.TrimSpace(input.NodeID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "nodeId is required"})
		return
	}
	setRequestNodeID(r, input.NodeID)
	if err := s.store.UnbindStorageNode(input.NodeID, r.Header.Get("X-Node-Token")); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "unbound"})
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
	setRequestNodeID(r, nodeID)
	waitTimeout, err := parseAgentJobsWaitTimeout(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	nodeToken := r.Header.Get("X-Node-Token")
	if waitTimeout <= 0 {
		s.writePendingJobs(w, nodeID, nodeToken)
		return
	}

	updates, unsubscribe := s.agentJobHub.Subscribe(nodeID)
	defer unsubscribe()
	deadline := time.Now().UTC().Add(waitTimeout)
	for {
		jobs, pendingErr := s.store.PendingJobs(nodeID, nodeToken)
		if pendingErr != nil {
			writeStoreError(w, pendingErr)
			return
		}
		if len(jobs) > 0 {
			writeJSON(w, http.StatusOK, map[string]any{"items": jobs})
			return
		}
		remaining := time.Until(deadline)
		if remaining <= 0 {
			writeJSON(w, http.StatusOK, map[string]any{"items": []domain.AgentJob{}})
			return
		}
		timer := time.NewTimer(remaining)
		select {
		case <-r.Context().Done():
			timer.Stop()
			return
		case <-updates:
			timer.Stop()
		case <-timer.C:
			writeJSON(w, http.StatusOK, map[string]any{"items": []domain.AgentJob{}})
			return
		}
	}
}

func (s *Server) writePendingJobs(w http.ResponseWriter, nodeID, nodeToken string) {
	jobs, err := s.store.PendingJobs(nodeID, nodeToken)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": jobs})
}

func parseAgentJobsWaitTimeout(r *http.Request) (time.Duration, error) {
	value := strings.TrimSpace(r.URL.Query().Get("waitSeconds"))
	if value == "" {
		return 0, nil
	}
	waitSeconds, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("waitSeconds must be an integer")
	}
	if waitSeconds < 0 {
		return 0, fmt.Errorf("waitSeconds must be non-negative")
	}
	if waitSeconds == 0 {
		return 0, nil
	}
	if waitSeconds > 30 {
		waitSeconds = 30
	}
	return time.Duration(waitSeconds) * time.Second, nil
}

func (s *Server) handleAgentJobActions(w http.ResponseWriter, r *http.Request) {
	path := trimAPIPrefix(r.URL.Path, "/api/v1/agents/jobs/")
	jobID := strings.TrimSuffix(strings.TrimSuffix(strings.TrimSuffix(strings.TrimSuffix(path, "/complete"), "/blob"), "/restore"), "/")
	if jobID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "job id is required"})
		return
	}
	nodeToken := r.Header.Get("X-Node-Token")
	nodeID := r.URL.Query().Get("nodeId")
	if nodeID != "" {
		setRequestNodeID(r, nodeID)
	}
	switch {
	case strings.HasSuffix(path, "/blob"):
		s.handleAgentJobBlob(w, r, nodeID, nodeToken, jobID)
	case strings.HasSuffix(path, "/restore"):
		s.handleAgentJobRestoreUpload(w, r, nodeID, nodeToken, jobID)
	case strings.HasSuffix(path, "/complete"):
		s.handleAgentJobComplete(w, r, nodeToken, jobID)
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (s *Server) handleAgentJobBlob(w http.ResponseWriter, r *http.Request, nodeID, nodeToken, jobID string) {
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
	if strings.TrimSpace(job.BlobKey) != "" {
		blobFile, err := s.blob.Open(job.BlobKey)
		if err == nil {
			defer blobFile.Close()
			w.Header().Set("Content-Type", job.MediaType)
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filepath.Base(job.FileName)))
			http.ServeContent(w, r, job.FileName, time.Time{}, blobFile)
			return
		}
		logRequestEvent(r, "warn", "agent job blob open failed", map[string]any{
			"job_id":   jobID,
			"media_id": job.MediaID,
			"blob_key": job.BlobKey,
			"status":   http.StatusNotFound,
			"error":    err.Error(),
		})
		if s.mediaStore != nil {
			_ = s.mediaStore.MarkOriginalBlobMissing(job.MediaID)
		}
	}
	if job.Type == "ingest_media" || job.Type == "rehydrate_media" {
		_ = s.store.FailAgentJob(jobID, "job blob not available")
		_ = s.store.FailUploadSessionByMedia(job.MediaID, "job blob not available")
	}
	writeLoggedError(r, w, http.StatusNotFound, "job blob not available", "agent job blob not available", nil, map[string]any{
		"job_id":   jobID,
		"media_id": job.MediaID,
		"blob_key": job.BlobKey,
		"job_type": job.Type,
	})
}

func (s *Server) handleAgentJobRestoreUpload(w http.ResponseWriter, r *http.Request, nodeID, nodeToken, jobID string) {
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
	file, header, ok := parseMultipartFile(w, r, s.maxUploadBytes)
	if !ok {
		return
	}
	defer file.Close()
	if s.cacheController != nil {
		if err := s.cacheController.EnsureSpace(header.Size); err != nil {
			status := http.StatusInsufficientStorage
			if err != errInsufficientLocalStorage {
				status = http.StatusInternalServerError
			}
			writeLoggedError(r, w, status, err.Error(), "agent restore upload rejected", err, map[string]any{
				"job_id":    jobID,
				"file_name": header.Filename,
				"file_size": header.Size,
			})
			return
		}
	}
	saved, err := s.blob.Save(jobID+"-restore", header.Filename, file)
	if err != nil {
		writeLoggedError(r, w, http.StatusInternalServerError, err.Error(), "agent restore upload save failed", err, map[string]any{
			"job_id":    jobID,
			"file_name": header.Filename,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"blobKey": saved.Key, "byteSize": saved.ByteSize})
}

func (s *Server) handleAgentJobComplete(w http.ResponseWriter, r *http.Request, nodeToken, jobID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	var input struct {
		NodeID string `json:"nodeId"`
		Report struct {
			OriginalPath    string `json:"originalPath"`
			PreviewBlobKey  string `json:"previewBlobKey"`
			RestoredBlobKey string `json:"restoredBlobKey"`
			Width           int    `json:"width"`
			Height          int    `json:"height"`
			PreviewStatus   string `json:"previewStatus"`
		} `json:"report"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	setRequestNodeID(r, input.NodeID)
	job, err := s.store.CompleteJob(input.NodeID, nodeToken, jobID, store.JobCompletionInput{
		OriginalPath:    input.Report.OriginalPath,
		PreviewBlobKey:  input.Report.PreviewBlobKey,
		RestoredBlobKey: input.Report.RestoredBlobKey,
		Width:           input.Report.Width,
		Height:          input.Report.Height,
		PreviewStatus:   domain.PreviewStatus(strings.TrimSpace(input.Report.PreviewStatus)),
		ProcessedAt:     time.Now().UTC(),
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if s.cacheController != nil && s.mediaStore != nil && job.Type == "restore_original" {
		media, mediaErr := s.mediaStore.MediaByPublicID(job.MediaID)
		if mediaErr == nil && media.PreviewStatus != domain.PreviewReady {
			go s.cacheController.RepairMissingPreview(media)
		}
	}
	if s.cacheController != nil {
		s.cacheController.RunNow()
	}
	writeJSON(w, http.StatusOK, job)
}
