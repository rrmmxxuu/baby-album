package httpapi

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
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
	jobs, err := s.store.PendingJobs(nodeID, r.Header.Get("X-Node-Token"))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": jobs})
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
	}
	if s.cacheController != nil && job.OriginalR2State == "online" && strings.TrimSpace(job.OriginalR2Key) != "" {
		result, err := s.cacheController.OpenWarmOriginal(r.Context(), domain.MediaAsset{
			ID:              job.MediaID,
			FileName:        job.FileName,
			MediaType:       job.MediaType,
			OriginalR2State: job.OriginalR2State,
			OriginalR2Key:   job.OriginalR2Key,
		})
		if err == nil {
			defer result.Body.Close()
			w.Header().Set("Content-Type", job.MediaType)
			w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filepath.Base(job.FileName)))
			w.WriteHeader(http.StatusOK)
			_, _ = io.Copy(w, result.Body)
			return
		}
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "job blob not available"})
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
	job, err := s.store.AgentJob(nodeID, nodeToken, jobID)
	if err != nil {
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
			writeJSON(w, status, map[string]string{"error": err.Error()})
			return
		}
	}
	saved, err := s.blob.Save(jobID+"-restore", header.Filename, file)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	if s.cacheController != nil && job.Type == "restore_original" && s.mediaStore != nil {
		media, mediaErr := s.mediaStore.MediaByPublicID(job.MediaID)
		if mediaErr == nil {
			media.OriginalBlobKey = saved.Key
			_ = s.cacheController.PromoteOriginalToWarmCache(r.Context(), media)
		}
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
	if s.cacheController != nil {
		s.cacheController.RunNow()
	}
	writeJSON(w, http.StatusOK, job)
}
