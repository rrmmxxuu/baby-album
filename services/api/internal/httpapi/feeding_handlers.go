package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"babyalbum/api/internal/domain"
	"babyalbum/api/internal/store"
)

type feedingItemPayload struct {
	Name string `json:"name"`
	Dose string `json:"dose"`
}

type feedingEntryPayload struct {
	Category   string               `json:"category"`
	OccurredAt string               `json:"occurredAt"`
	EndedAt    *string              `json:"endedAt"`
	Note       string               `json:"note"`
	MilkMode   string               `json:"milkMode"`
	AmountML   *int                 `json:"amountMl"`
	FoodName   string               `json:"foodName"`
	HasStool   *bool                `json:"hasStool"`
	Items      []feedingItemPayload `json:"items"`
}

type decodedFeedingEntryPayload struct {
	Category   domain.FeedingCategory
	OccurredAt time.Time
	EndedAt    *time.Time
	Note       string
	MilkMode   domain.FeedingMilkMode
	AmountML   *int
	FoodName   string
	HasStool   *bool
	Items      []store.FeedingEntryItemInput
}

func (s *Server) handleBabyFeedingDay(w http.ResponseWriter, r *http.Request, babyID string) {
	if r.Method != http.MethodGet {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	day, err := s.store.FeedingDay(userID, store.FeedingDayInput{
		BabyID: babyID,
		Day:    strings.TrimSpace(r.URL.Query().Get("day")),
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, day)
}

func (s *Server) handleBabyFeedingEntries(w http.ResponseWriter, r *http.Request, babyID string) {
	if r.Method != http.MethodPost {
		writeMethodNotAllowed(w)
		return
	}
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	input, err := decodeFeedingEntryPayload(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	entry, err := s.store.CreateFeedingEntry(userID, store.CreateFeedingEntryInput{
		BabyID:     babyID,
		Category:   input.Category,
		OccurredAt: input.OccurredAt,
		EndedAt:    input.EndedAt,
		Note:       input.Note,
		MilkMode:   input.MilkMode,
		AmountML:   input.AmountML,
		FoodName:   input.FoodName,
		HasStool:   input.HasStool,
		Items:      input.Items,
	})
	if err != nil {
		writeStoreError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, entry)
}

func (s *Server) handleBabyFeedingEntryActions(w http.ResponseWriter, r *http.Request, babyID, entryID string) {
	userID, err := s.actorID(r)
	if err != nil {
		writeStoreError(w, err)
		return
	}
	switch r.Method {
	case http.MethodPost:
		input, decodeErr := decodeFeedingEntryPayload(r)
		if decodeErr != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": decodeErr.Error()})
			return
		}
		entry, updateErr := s.store.UpdateFeedingEntry(userID, store.UpdateFeedingEntryInput{
			BabyID:     babyID,
			EntryID:    entryID,
			Category:   input.Category,
			OccurredAt: input.OccurredAt,
			EndedAt:    input.EndedAt,
			Note:       input.Note,
			MilkMode:   input.MilkMode,
			AmountML:   input.AmountML,
			FoodName:   input.FoodName,
			HasStool:   input.HasStool,
			Items:      input.Items,
		})
		if updateErr != nil {
			writeStoreError(w, updateErr)
			return
		}
		writeJSON(w, http.StatusOK, entry)
	case http.MethodDelete:
		if err := s.store.DeleteFeedingEntry(userID, babyID, entryID); err != nil {
			writeStoreError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"deleted": true})
	default:
		writeMethodNotAllowed(w)
	}
}

func decodeFeedingEntryPayload(r *http.Request) (decodedFeedingEntryPayload, error) {
	var payload feedingEntryPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		return decodedFeedingEntryPayload{}, invalidJSONError("invalid json")
	}
	occurredAt, err := parseRequiredRFC3339(payload.OccurredAt, "occurredAt")
	if err != nil {
		return decodedFeedingEntryPayload{}, err
	}
	endedAt, err := parseOptionalRFC3339(payload.EndedAt, "endedAt")
	if err != nil {
		return decodedFeedingEntryPayload{}, err
	}
	items := make([]store.FeedingEntryItemInput, 0, len(payload.Items))
	for _, item := range payload.Items {
		items = append(items, store.FeedingEntryItemInput{
			Name: item.Name,
			Dose: item.Dose,
		})
	}
	return decodedFeedingEntryPayload{
		Category:   domain.FeedingCategory(strings.TrimSpace(payload.Category)),
		OccurredAt: occurredAt,
		EndedAt:    endedAt,
		Note:       payload.Note,
		MilkMode:   domain.FeedingMilkMode(strings.TrimSpace(payload.MilkMode)),
		AmountML:   payload.AmountML,
		FoodName:   payload.FoodName,
		HasStool:   payload.HasStool,
		Items:      items,
	}, nil
}

type invalidJSONError string

func (e invalidJSONError) Error() string {
	return string(e)
}
