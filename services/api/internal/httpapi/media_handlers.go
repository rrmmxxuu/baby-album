package httpapi

import (
	"encoding/json"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

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
		AlbumID       string  `json:"albumId"`
		EntryID       string  `json:"entryId"`
		UploadBatchID string  `json:"uploadBatchId"`
		FileName      string  `json:"fileName"`
		MediaType     string  `json:"mediaType"`
		CapturedAt    *string `json:"capturedAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	capturedAt, err := parseOptionalRFC3339(input.CapturedAt, "capturedAt")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	session, err := s.store.CreateUploadSession(userID, store.UploadSessionInput{
		AlbumID:       input.AlbumID,
		EntryID:       input.EntryID,
		UploadBatchID: input.UploadBatchID,
		FileName:      input.FileName,
		MediaType:     input.MediaType,
		CapturedAt:    capturedAt,
	})
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
	path := trimAPIPrefix(r.URL.Path, "/api/v1/upload-sessions/")
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
	file, header, ok := parseMultipartFile(w, r, s.maxUploadBytes)
	if !ok {
		return
	}
	defer file.Close()

	saved, err := s.blob.Save(sessionID, header.Filename, file)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	session, err := s.store.AttachUploadContent(userID, sessionID, store.UploadContentInput{
		ByteSize:      saved.ByteSize,
		BlobKey:       saved.Key,
		ContentSHA256: saved.ContentSHA256,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleMediaActions(w http.ResponseWriter, r *http.Request) {
	path := trimAPIPrefix(r.URL.Path, "/api/v1/media/")
	if !strings.HasSuffix(path, "/preview") && !strings.HasSuffix(path, "/original") {
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
	serveOriginal := strings.HasSuffix(path, "/original")
	mediaID := strings.TrimSuffix(strings.TrimSuffix(strings.TrimSuffix(path, "/preview"), "/original"), "/")
	if mediaID == "" || albumID(r) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "media id and albumId are required"})
		return
	}
	item, err := s.store.MediaByID(albumID(r), userID, mediaID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	blobKey := item.PreviewBlobKey
	contentType := "image/jpeg"
	fileName := filepath.Base(item.FileName) + "-preview.jpg"
	if serveOriginal {
		if item.OriginalBlobKey == "" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "original not available"})
			return
		}
		blobKey = item.OriginalBlobKey
		contentType = item.MediaType
		fileName = filepath.Base(item.FileName)
	} else {
		if item.PreviewStatus != domain.PreviewReady || item.PreviewBlobKey == "" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "preview not available"})
			return
		}
	}
	blobFile, err := s.blob.Open(blobKey)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	defer blobFile.Close()
	w.Header().Set("Content-Type", contentType)
	http.ServeContent(w, r, fileName, time.Time{}, blobFile)
}

func (s *Server) handleBabyAssets(w http.ResponseWriter, r *http.Request) {
	parts := splitPath(trimAPIPrefix(r.URL.Path, "/api/v1/babies/"))
	if len(parts) != 2 || parts[1] != "avatar" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	babyID := parts[0]
	if babyID == "" || albumID(r) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "baby id and albumId are required"})
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	baby, err := s.store.BabyByID(userID, albumID(r), babyID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if baby.AvatarKey == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "avatar not available"})
		return
	}
	blobFile, err := s.blob.Open(baby.AvatarKey)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	defer blobFile.Close()
	w.Header().Set("Content-Type", contentTypeForFileName(baby.AvatarKey))
	http.ServeContent(w, r, filepath.Base(baby.AvatarKey), time.Time{}, blobFile)
}
