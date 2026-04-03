package httpapi

import "sync"

type agentJobHub struct {
	mu          sync.Mutex
	subscribers map[string]map[chan struct{}]struct{}
}

func newAgentJobHub() *agentJobHub {
	return &agentJobHub{
		subscribers: make(map[string]map[chan struct{}]struct{}),
	}
}

func (h *agentJobHub) Subscribe(nodeID string) (<-chan struct{}, func()) {
	ch := make(chan struct{}, 1)
	h.mu.Lock()
	if _, ok := h.subscribers[nodeID]; !ok {
		h.subscribers[nodeID] = make(map[chan struct{}]struct{})
	}
	h.subscribers[nodeID][ch] = struct{}{}
	h.mu.Unlock()

	return ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if subscribers, ok := h.subscribers[nodeID]; ok {
			delete(subscribers, ch)
			if len(subscribers) == 0 {
				delete(h.subscribers, nodeID)
			}
		}
	}
}

func (h *agentJobHub) Publish(nodeID string) {
	h.mu.Lock()
	subscribers := make([]chan struct{}, 0, len(h.subscribers[nodeID]))
	for ch := range h.subscribers[nodeID] {
		subscribers = append(subscribers, ch)
	}
	h.mu.Unlock()

	for _, ch := range subscribers {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}
