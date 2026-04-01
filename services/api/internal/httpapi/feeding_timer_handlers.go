package httpapi

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

type feedingTimerActionPayload struct {
	Action          string `json:"action"`
	Side            string `json:"side"`
	ExpectedVersion int    `json:"expectedVersion"`
}

type feedingTimerFinishPayload struct {
	ExpectedVersion int    `json:"expectedVersion"`
	Note            string `json:"note"`
}

type feedingTimerStatePayload struct {
	Session *domain.BreastFeedingTimerSession `json:"session"`
}

func (s *Server) handleBabyFeedingTimer(w http.ResponseWriter, r *http.Request, babyID string) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	session, err := s.store.FeedingTimer(userID, babyID)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, feedingTimerStatePayload{Session: session})
}

func (s *Server) handleBabyFeedingTimerActions(w http.ResponseWriter, r *http.Request, babyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	var payload feedingTimerActionPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	session, err := s.store.ApplyFeedingTimerAction(userID, store.FeedingTimerActionInput{
		BabyID:          babyID,
		Action:          store.FeedingTimerAction(payload.Action),
		Side:            domain.FeedingTimerSide(payload.Side),
		ExpectedVersion: payload.ExpectedVersion,
	})
	if err != nil {
		writeFeedingTimerError(w, err)
		return
	}
	s.timerHub.Publish(babyID, session)
	writeJSON(w, http.StatusOK, feedingTimerStatePayload{Session: session})
}

func (s *Server) handleBabyFeedingTimerFinish(w http.ResponseWriter, r *http.Request, babyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	var payload feedingTimerFinishPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	entry, err := s.store.FinishFeedingTimer(userID, store.FinishFeedingTimerInput{
		BabyID:          babyID,
		ExpectedVersion: payload.ExpectedVersion,
		Note:            payload.Note,
	})
	if err != nil {
		writeFeedingTimerError(w, err)
		return
	}
	s.timerHub.Publish(babyID, nil)
	writeJSON(w, http.StatusOK, entry)
}

func (s *Server) handleBabyFeedingTimerStream(w http.ResponseWriter, r *http.Request, babyID string) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming unsupported"})
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	session, err := s.store.FeedingTimer(userID, babyID)
	if err != nil {
		writeStoreError(w, err)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	if err := writeFeedingTimerEvent(w, feedingTimerStatePayload{Session: session}); err != nil {
		return
	}
	flusher.Flush()

	updates, unsubscribe := s.timerHub.Subscribe(babyID)
	defer unsubscribe()
	heartbeat := time.NewTicker(20 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case session := <-updates:
			if err := writeFeedingTimerEvent(w, feedingTimerStatePayload{Session: session}); err != nil {
				return
			}
			flusher.Flush()
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": keep-alive\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}

func writeFeedingTimerError(w http.ResponseWriter, err error) {
	var conflict *store.FeedingTimerConflictError
	if ok := asFeedingTimerConflict(err, &conflict); ok {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error":   store.ErrConflict.Error(),
			"session": conflict.Session,
		})
		return
	}
	writeStoreError(w, err)
}

func asFeedingTimerConflict(err error, target **store.FeedingTimerConflictError) bool {
	if err == nil {
		return false
	}
	conflict, ok := err.(*store.FeedingTimerConflictError)
	if ok {
		*target = conflict
		return true
	}
	return false
}

func writeFeedingTimerEvent(w http.ResponseWriter, payload feedingTimerStatePayload) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: session\ndata: %s\n\n", body)
	return err
}
