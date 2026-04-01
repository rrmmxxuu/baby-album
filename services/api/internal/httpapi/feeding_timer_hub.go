package httpapi

import (
	"sync"

	"babyalbum/api/internal/domain"
)

type feedingTimerHub struct {
	mu          sync.Mutex
	subscribers map[string]map[chan *domain.BreastFeedingTimerSession]struct{}
}

func newFeedingTimerHub() *feedingTimerHub {
	return &feedingTimerHub{
		subscribers: make(map[string]map[chan *domain.BreastFeedingTimerSession]struct{}),
	}
}

func (h *feedingTimerHub) Subscribe(babyID string) (<-chan *domain.BreastFeedingTimerSession, func()) {
	ch := make(chan *domain.BreastFeedingTimerSession, 1)
	h.mu.Lock()
	if _, ok := h.subscribers[babyID]; !ok {
		h.subscribers[babyID] = make(map[chan *domain.BreastFeedingTimerSession]struct{})
	}
	h.subscribers[babyID][ch] = struct{}{}
	h.mu.Unlock()

	return ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if subscribers, ok := h.subscribers[babyID]; ok {
			delete(subscribers, ch)
			if len(subscribers) == 0 {
				delete(h.subscribers, babyID)
			}
		}
		close(ch)
	}
}

func (h *feedingTimerHub) Publish(babyID string, session *domain.BreastFeedingTimerSession) {
	h.mu.Lock()
	subscribers := make([]chan *domain.BreastFeedingTimerSession, 0, len(h.subscribers[babyID]))
	for ch := range h.subscribers[babyID] {
		subscribers = append(subscribers, ch)
	}
	h.mu.Unlock()

	for _, ch := range subscribers {
		payload := cloneFeedingTimerSession(session)
		select {
		case ch <- payload:
		default:
			select {
			case <-ch:
			default:
			}
			select {
			case ch <- payload:
			default:
			}
		}
	}
}

func cloneFeedingTimerSession(session *domain.BreastFeedingTimerSession) *domain.BreastFeedingTimerSession {
	if session == nil {
		return nil
	}
	cloned := *session
	if session.ActiveSegmentStartedAt != nil {
		value := *session.ActiveSegmentStartedAt
		cloned.ActiveSegmentStartedAt = &value
	}
	return &cloned
}
