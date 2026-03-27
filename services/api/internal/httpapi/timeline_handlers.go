package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

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
	cursor := strings.TrimSpace(r.URL.Query().Get("cursor"))
	limit := 0
	if rawLimit := strings.TrimSpace(r.URL.Query().Get("limit")); rawLimit != "" {
		parsedLimit, parseErr := strconv.Atoi(rawLimit)
		if parseErr != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "limit must be a number"})
			return
		}
		limit = parsedLimit
	}
	page, err := s.store.TimelinePage(albumID(r), userID, store.TimelinePageInput{Cursor: cursor, Limit: limit})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) handleTimelineEntries(w http.ResponseWriter, r *http.Request) {
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
		AlbumID    string `json:"albumId"`
		Caption    string `json:"caption"`
		Visibility string `json:"visibility"`
		TimeMode   string `json:"timeMode"`
		DisplayAt  string `json:"displayAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	displayAt, err := parseRequiredRFC3339(input.DisplayAt, "displayAt")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	entry, err := s.store.CreateTimelineEntry(userID, store.CreateTimelineEntryInput{
		AlbumID:    input.AlbumID,
		Caption:    input.Caption,
		Visibility: domain.TimelineEntryVisibility(input.Visibility),
		TimeMode:   domain.TimelineEntryTimeMode(input.TimeMode),
		DisplayAt:  displayAt,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, entry)
}

func (s *Server) handleTimelineEntryActions(w http.ResponseWriter, r *http.Request) {
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	parts := splitPath(trimAPIPrefix(r.URL.Path, "/api/v1/timeline-entries/"))
	if len(parts) == 0 || parts[0] == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "entry id is required"})
		return
	}
	entryID := parts[0]
	switch {
	case len(parts) == 1 && r.Method == http.MethodPost:
		s.handleTimelineEntryUpdate(w, r, userID, entryID)
	case len(parts) == 1 && r.Method == http.MethodDelete:
		s.handleTimelineEntryDelete(w, r, userID, entryID)
	case len(parts) == 2 && parts[1] == "comments" && r.Method == http.MethodPost:
		s.handleTimelineEntryCommentCreate(w, r, userID, entryID)
	case len(parts) == 3 && parts[1] == "media" && r.Method == http.MethodDelete:
		s.handleTimelineEntryMediaDelete(w, r, userID, entryID, parts[2])
	default:
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
	}
}

func (s *Server) handleTimelineEntryUpdate(w http.ResponseWriter, r *http.Request, userID, entryID string) {
	var input struct {
		AlbumID    string `json:"albumId"`
		Caption    string `json:"caption"`
		Visibility string `json:"visibility"`
		TimeMode   string `json:"timeMode"`
		DisplayAt  string `json:"displayAt"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	displayAt, err := parseRequiredRFC3339(input.DisplayAt, "displayAt")
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	entry, err := s.store.UpdateTimelineEntry(userID, store.UpdateTimelineEntryInput{
		AlbumID:    input.AlbumID,
		EntryID:    entryID,
		Caption:    input.Caption,
		Visibility: domain.TimelineEntryVisibility(input.Visibility),
		TimeMode:   domain.TimelineEntryTimeMode(input.TimeMode),
		DisplayAt:  displayAt,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) handleTimelineEntryDelete(w http.ResponseWriter, r *http.Request, userID, entryID string) {
	albumID := strings.TrimSpace(r.URL.Query().Get("albumId"))
	if albumID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "albumId is required"})
		return
	}
	if err := s.store.DeleteTimelineEntry(userID, albumID, entryID); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}

func (s *Server) handleTimelineEntryCommentCreate(w http.ResponseWriter, r *http.Request, userID, entryID string) {
	var input struct {
		AlbumID string `json:"albumId"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	comment, err := s.store.CreateTimelineComment(userID, store.CreateTimelineCommentInput{
		AlbumID: input.AlbumID,
		EntryID: entryID,
		Content: input.Content,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, comment)
}

func (s *Server) handleTimelineEntryMediaDelete(w http.ResponseWriter, r *http.Request, userID, entryID, mediaID string) {
	albumID := strings.TrimSpace(r.URL.Query().Get("albumId"))
	if albumID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "albumId is required"})
		return
	}
	if err := s.store.DeleteTimelineEntryMedia(userID, albumID, entryID, mediaID); err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
}
