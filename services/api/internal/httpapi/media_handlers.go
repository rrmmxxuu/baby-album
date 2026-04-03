package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
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
	if s.cacheController != nil {
		if err := s.cacheController.EnsureSpace(header.Size); err != nil {
			status := http.StatusInsufficientStorage
			if !errors.Is(err, errInsufficientLocalStorage) {
				status = http.StatusInternalServerError
			}
			writeJSON(w, status, map[string]string{"error": err.Error()})
			return
		}
	}
	saved, err := s.blob.Save(sessionID, header.Filename, file)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	sourcePath := filepath.Join(s.blob.Root(), saved.Key)
	metadata := inspectUploadedMedia(sourcePath, header.Filename, header.Header.Get("Content-Type"))
	preview := s.generateUploadedMediaPreview(saved.Key, header.Filename, metadata.DetectedMediaType)
	session, err := s.store.AttachUploadContent(userID, sessionID, store.UploadContentInput{
		ByteSize:               saved.ByteSize,
		BlobKey:                saved.Key,
		ContentSHA256:          saved.ContentSHA256,
		DetectedMediaType:      metadata.DetectedMediaType,
		DetectedCapturedAtRaw:  metadata.DetectedCapturedAtRaw,
		Width:                  preview.Width,
		Height:                 preview.Height,
		PreviewStatus:          preview.Status,
		PreviewBlobKey:         preview.BlobKey,
		ScreenPreviewStatus:    preview.ScreenPreviewStatus,
		ScreenPreviewObjectKey: preview.ScreenPreviewObjectKey,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if s.cacheController != nil {
		s.cacheController.RunNow()
	}
	writeJSON(w, http.StatusOK, session)
}

func (s *Server) handleMediaActions(w http.ResponseWriter, r *http.Request) {
	path := trimAPIPrefix(r.URL.Path, "/api/v1/media/")
	switch {
	case strings.HasSuffix(path, "/preview"), strings.HasSuffix(path, "/screen-preview"), strings.HasSuffix(path, "/original"):
		s.handleMediaBinary(w, r, path)
	case strings.HasSuffix(path, "/original-status"):
		s.handleMediaOriginalStatus(w, r, path)
	case strings.HasSuffix(path, "/preview-repair"):
		s.handleMediaPreviewRepair(w, r, path)
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (s *Server) handleMediaBinary(w http.ResponseWriter, r *http.Request, path string) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	serveOriginal := strings.HasSuffix(path, "/original")
	serveScreenPreview := strings.HasSuffix(path, "/screen-preview")
	mediaID := path
	switch {
	case serveOriginal:
		mediaID = strings.TrimSuffix(path, "/original")
	case serveScreenPreview:
		mediaID = strings.TrimSuffix(path, "/screen-preview")
	default:
		mediaID = strings.TrimSuffix(path, "/preview")
	}
	mediaID = strings.TrimSuffix(mediaID, "/")
	if mediaID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "media id is required"})
		return
	}
	item, err := s.resolveMediaAssetRequest(r, mediaID, mediaRequestKind(serveOriginal, serveScreenPreview))
	if err != nil {
		writeStoreError(w, err)
		return
	}
	item = s.decorateMediaAsset(item)
	if serveOriginal {
		s.serveOriginalAsset(w, r, item)
		return
	}
	if serveScreenPreview {
		s.serveScreenPreviewAsset(w, r, item)
		return
	}
	s.servePreviewAsset(w, r, item)
}

func (s *Server) handleMediaOriginalStatus(w http.ResponseWriter, r *http.Request, path string) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	if s.mediaStore == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "media state store unavailable"})
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	mediaID := strings.TrimSuffix(strings.TrimSuffix(path, "/original-status"), "/")
	if mediaID == "" || albumID(r) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "media id and albumId are required"})
		return
	}
	triggerRestore := r.URL.Query().Get("triggerRestore") == "true"
	item, err := s.mediaStore.ResolveOriginalStatus(userID, albumID(r), mediaID, triggerRestore)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	item = s.decorateMediaAsset(item)
	writeJSON(w, http.StatusOK, map[string]any{
		"media":                item,
		"originalAvailability": item.OriginalAvail,
		"originalUrl":          item.OriginalURL,
	})
}

func (s *Server) handleMediaPreviewRepair(w http.ResponseWriter, r *http.Request, path string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	if s.mediaStore == nil || s.cacheController == nil {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "preview repair unavailable"})
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	mediaID := strings.TrimSuffix(strings.TrimSuffix(path, "/preview-repair"), "/")
	album := albumID(r)
	if mediaID == "" || album == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "media id and albumId are required"})
		return
	}
	item, err := s.store.MediaByID(album, userID, mediaID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if strings.TrimSpace(item.PreviewBlobKey) == "" && strings.TrimSpace(item.ScreenPreviewObjectKey) == "" && strings.TrimSpace(item.OriginalBlobKey) == "" && item.OriginalR2State != "online" && strings.TrimSpace(item.OriginalPath) != "" && item.OriginalRestoreState != "pending" {
		if markErr := s.store.MarkPreviewsPending(mediaID); markErr != nil {
			writeStoreError(w, markErr)
			return
		}
		item.PreviewStatus = domain.PreviewPending
		item.ScreenPreviewStatus = domain.PreviewPending
		item, err = s.mediaStore.ResolveOriginalStatus(userID, album, mediaID, true)
		if err != nil {
			writeStoreError(w, err)
			return
		}
	}
	repaired, repairErr := s.cacheController.EnsureMediaPreviews(r.Context(), item)
	if repairErr == nil {
		item = repaired
	}
	item = s.decorateMediaAsset(item)
	writeJSON(w, http.StatusOK, map[string]any{"media": item})
}

func (s *Server) servePreviewAsset(w http.ResponseWriter, r *http.Request, item domain.MediaAsset) {
	if item.PreviewStatus != domain.PreviewReady || item.PreviewBlobKey == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "preview not available"})
		return
	}
	file, err := s.blob.Open(item.PreviewBlobKey)
	if err != nil {
		if s.cacheController != nil {
			go s.cacheController.RepairMissingPreview(item)
		} else if s.mediaStore != nil {
			_ = s.mediaStore.MarkPreviewMissing(item.ID)
		}
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "preview blob not found"})
		return
	}
	defer file.Close()
	lastModified := item.UploadedAt
	if item.ProcessedAt != nil {
		lastModified = item.ProcessedAt.UTC()
	}
	etag := mediaETag(previewURLKind, item)
	if etagMatches(r, etag) || modifiedSince(r, lastModified) {
		w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
		w.Header().Set("ETag", etag)
		w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.Header().Set("Content-Type", "image/jpeg")
	w.Header().Set("ETag", etag)
	w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
	http.ServeContent(w, r, filepath.Base(item.FileName)+"-preview.jpg", lastModified, file)
}

func (s *Server) serveScreenPreviewAsset(w http.ResponseWriter, r *http.Request, item domain.MediaAsset) {
	if item.ScreenPreviewStatus != domain.PreviewReady || strings.TrimSpace(item.ScreenPreviewObjectKey) == "" || s.screenPreviews == nil || !s.screenPreviews.Enabled() {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "screen preview not available"})
		return
	}
	result, err := s.screenPreviews.Get(r.Context(), item.ScreenPreviewObjectKey)
	if err != nil {
		if s.cacheController != nil {
			go func(media domain.MediaAsset) {
				_, _ = s.cacheController.EnsureMediaPreviews(context.Background(), media)
			}(item)
		} else if s.mediaStore != nil {
			_ = s.mediaStore.MarkScreenPreviewMissing(item.ID)
		}
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "screen preview not available"})
		return
	}
	defer result.Body.Close()
	lastModified := item.UploadedAt
	if item.ProcessedAt != nil {
		lastModified = item.ProcessedAt.UTC()
	}
	etag := mediaETag(screenPreviewURLKind, item)
	if etagMatches(r, etag) || modifiedSince(r, lastModified) {
		w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
		w.Header().Set("ETag", etag)
		w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.Header().Set("Content-Type", firstNonEmptyContentType(result.ContentType))
	w.Header().Set("ETag", etag)
	w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, result.Body)
}

func firstNonEmptyContentType(value string) string {
	if strings.TrimSpace(value) != "" {
		return value
	}
	return "image/jpeg"
}

func (s *Server) serveOriginalAsset(w http.ResponseWriter, r *http.Request, item domain.MediaAsset) {
	availability := mediaOriginalAvailability(item)
	if availability == domain.OriginalHot {
		if err := s.serveLocalOriginal(w, r, item); err == nil {
			return
		}
		if s.mediaStore != nil {
			_ = s.mediaStore.MarkOriginalBlobMissing(item.ID)
		}
		item.OriginalBlobKey = ""
		if strings.TrimSpace(item.OriginalPath) != "" {
			item.OriginalLocalState = "evicted"
		} else {
			item.OriginalLocalState = "pending"
		}
		if item.OriginalR2State == "online" && strings.TrimSpace(item.OriginalR2Key) != "" {
			availability = domain.OriginalWarm
		} else if item.OriginalPath != "" {
			availability = domain.OriginalCold
		} else {
			availability = domain.OriginalUnavailable
		}
	}
	if availability == domain.OriginalWarm {
		if s.cacheController != nil {
			restored, err := s.cacheController.RestoreLocalOriginalFromWarmCache(r.Context(), item)
			if err == nil {
				restored = s.decorateMediaAsset(restored)
				if err := s.serveLocalOriginal(w, r, restored); err == nil {
					return
				}
			}
			warmResult, warmErr := s.cacheController.OpenWarmOriginal(r.Context(), item)
			if warmErr == nil {
				defer warmResult.Body.Close()
				s.serveWarmOriginalStream(w, item, warmResult.Body)
				return
			}
		}
	}
	status := http.StatusNotFound
	message := "original not available"
	if availability == domain.OriginalCold || availability == domain.OriginalRestoring {
		status = http.StatusAccepted
		message = "original restoring"
	}
	writeJSON(w, status, map[string]any{
		"error":                message,
		"originalAvailability": availability,
	})
}

func (s *Server) serveLocalOriginal(w http.ResponseWriter, r *http.Request, item domain.MediaAsset) error {
	file, err := s.blob.Open(item.OriginalBlobKey)
	if err != nil {
		return err
	}
	defer file.Close()
	lastModified := item.UploadedAt
	if item.ProcessedAt != nil {
		lastModified = item.ProcessedAt.UTC()
	}
	etag := mediaETag(originalURLKind, item)
	if etagMatches(r, etag) || modifiedSince(r, lastModified) {
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("ETag", etag)
		w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
		w.WriteHeader(http.StatusNotModified)
		return nil
	}
	if s.mediaStore != nil {
		_ = s.mediaStore.RecordOriginalAccess(item.ID, time.Now().UTC())
	}
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", item.MediaType)
	w.Header().Set("ETag", etag)
	w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
	http.ServeContent(w, r, filepath.Base(item.FileName), lastModified, file)
	return nil
}

func (s *Server) serveWarmOriginalStream(w http.ResponseWriter, item domain.MediaAsset, result io.Reader) {
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Content-Type", item.MediaType)
	w.WriteHeader(http.StatusOK)
	_, _ = io.Copy(w, result)
}

func (s *Server) handleBabyAssets(w http.ResponseWriter, r *http.Request) {
	parts := splitPath(trimAPIPrefix(r.URL.Path, "/api/v1/babies/"))
	if len(parts) == 0 || parts[0] == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "baby id is required"})
		return
	}
	babyID := parts[0]
	switch {
	case len(parts) == 2 && parts[1] == "avatar":
		s.handleBabyAvatarAsset(w, r, babyID)
	case len(parts) == 2 && parts[1] == "feeding":
		s.handleBabyFeedingDay(w, r, babyID)
	case len(parts) == 2 && parts[1] == "feeding-timer":
		s.handleBabyFeedingTimer(w, r, babyID)
	case len(parts) == 2 && parts[1] == "feeding-entries":
		s.handleBabyFeedingEntries(w, r, babyID)
	case len(parts) == 3 && parts[1] == "feeding-timer" && parts[2] == "actions":
		s.handleBabyFeedingTimerActions(w, r, babyID)
	case len(parts) == 3 && parts[1] == "feeding-timer" && parts[2] == "finish":
		s.handleBabyFeedingTimerFinish(w, r, babyID)
	case len(parts) == 3 && parts[1] == "feeding-timer" && parts[2] == "stream":
		s.handleBabyFeedingTimerStream(w, r, babyID)
	case len(parts) == 3 && parts[1] == "feeding-entries":
		s.handleBabyFeedingEntryActions(w, r, babyID, parts[2])
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (s *Server) handleBabyAvatarAsset(w http.ResponseWriter, r *http.Request, babyID string) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	baby, err := s.resolveBabyAssetRequest(r, babyID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	if baby.AvatarKey == "" {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "avatar not available"})
		return
	}
	file, err := s.blob.Open(baby.AvatarKey)
	if err != nil {
		if s.mediaStore != nil {
			_ = s.mediaStore.ClearBabyAvatar(baby.ID)
		}
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "avatar blob not found"})
		return
	}
	defer file.Close()
	lastModified := baby.CreatedAt
	if baby.AvatarUpdatedAt != nil {
		lastModified = baby.AvatarUpdatedAt.UTC()
	}
	etag := `"` + strings.ReplaceAll(strings.TrimSpace(baby.AvatarKey), `"`, "") + `"`
	if etagMatches(r, etag) || modifiedSince(r, lastModified) {
		w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
		w.Header().Set("ETag", etag)
		w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
		w.WriteHeader(http.StatusNotModified)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=86400, immutable")
	w.Header().Set("Content-Type", contentTypeForFileName(baby.AvatarKey))
	w.Header().Set("ETag", etag)
	w.Header().Set("Last-Modified", lastModified.UTC().Format(http.TimeFormat))
	http.ServeContent(w, r, filepath.Base(baby.AvatarKey), lastModified, file)
}

func mediaRequestKind(serveOriginal, serveScreenPreview bool) string {
	if serveOriginal {
		return originalURLKind
	}
	if serveScreenPreview {
		return screenPreviewURLKind
	}
	return previewURLKind
}

func (s *Server) resolveMediaAssetRequest(r *http.Request, mediaID, expectedKind string) (domain.MediaAsset, error) {
	if s.mediaStore != nil && s.verifySignedMediaRequest(r, expectedKind) {
		item, err := s.mediaStore.MediaByPublicID(mediaID)
		if err != nil {
			return domain.MediaAsset{}, err
		}
		if version := strings.TrimSpace(r.URL.Query().Get("v")); version != "" && version != mediaVersion(item) {
			return domain.MediaAsset{}, store.ErrNotFound
		}
		return item, nil
	}
	userID, err := s.actorID(r)
	if err != nil {
		return domain.MediaAsset{}, err
	}
	if albumID(r) == "" {
		return domain.MediaAsset{}, store.ErrUnauthorized
	}
	return s.store.MediaByID(albumID(r), userID, mediaID)
}

func (s *Server) resolveBabyAssetRequest(r *http.Request, babyID string) (domain.BabyProfile, error) {
	if s.mediaStore != nil && s.verifySignedMediaRequest(r, avatarURLKind) {
		item, err := s.mediaStore.BabyByPublicID(babyID)
		if err != nil {
			return domain.BabyProfile{}, err
		}
		if version := strings.TrimSpace(r.URL.Query().Get("v")); version != "" {
			currentVersion := item.CreatedAt.UTC().Format(time.RFC3339Nano)
			if item.AvatarUpdatedAt != nil {
				currentVersion = item.AvatarUpdatedAt.UTC().Format(time.RFC3339Nano)
			}
			if version != currentVersion {
				return domain.BabyProfile{}, store.ErrNotFound
			}
		}
		return item, nil
	}
	userID, err := s.actorID(r)
	if err != nil {
		return domain.BabyProfile{}, err
	}
	if albumID(r) == "" {
		return domain.BabyProfile{}, store.ErrUnauthorized
	}
	return s.store.BabyByID(userID, albumID(r), babyID)
}
