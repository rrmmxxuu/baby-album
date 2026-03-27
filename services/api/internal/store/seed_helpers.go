package store

import (
	"strings"
	"time"

	"babyalbum/api/internal/domain"
)

func newSeedMedia(id, familyID, fileName, mediaType string, capturedAt time.Time, source string) domain.MediaAsset {
	capturedAt = capturedAt.UTC()
	processedAt := capturedAt.Add(5 * time.Minute)
	return domain.MediaAsset{
		ID:             id,
		FamilyID:       familyID,
		EntryID:        id,
		UploadBatchID:  id,
		UploadedBy:     "user-owner",
		UploadedByName: "Ramon",
		FileName:       fileName,
		MediaType:      mediaType,
		CapturedAt:     capturedAt,
		UploadedAt:     capturedAt.Add(3 * time.Minute),
		TimelineDay:    capturedAt.Format("2006-01-02"),
		Status:         domain.MediaReady,
		Source:         source,
		PreviewStatus:  domain.PreviewUnavailable,
		ProcessedAt:    &processedAt,
	}
}

func seedTimelineEntries(items []domain.MediaAsset) []domain.TimelineEntry {
	entries := make([]domain.TimelineEntry, 0, len(items))
	for _, item := range items {
		entries = append(entries, domain.TimelineEntry{
			ID:             item.EntryID,
			FamilyID:       item.FamilyID,
			Caption:        "",
			Visibility:     domain.EntryVisibilityMembers,
			TimeMode:       domain.EntryTimeCaptured,
			DisplayAt:      item.CapturedAt,
			TimelineDay:    item.CapturedAt.Format("2006-01-02"),
			UploadedBy:     item.UploadedBy,
			UploadedByName: item.UploadedByName,
			UploadedAt:     item.UploadedAt,
			CreatedAt:      item.UploadedAt,
			Items:          []domain.MediaAsset{item},
		})
	}
	sortTimelineEntries(entries)
	return entries
}

func timePointer(value time.Time) *time.Time {
	utc := value.UTC()
	return &utc
}

func fallbackNodeName(name, nodeID string) string {
	if trimmed := strings.TrimSpace(name); trimmed != "" {
		return trimmed
	}
	return "NAS " + nodeID
}

func primaryBaby(items []domain.BabyProfile) *domain.BabyProfile {
	if len(items) == 0 {
		return nil
	}
	baby := items[0]
	return &baby
}
