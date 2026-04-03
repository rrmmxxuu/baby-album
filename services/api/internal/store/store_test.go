package store

import (
	"testing"
	"time"

	"babyalbum/api/internal/domain"
)

func TestNormalizeCapturedAt(t *testing.T) {
	uploadedAt := time.Date(2026, 3, 25, 12, 0, 0, 0, time.UTC)
	modifiedAt := uploadedAt.Add(-time.Hour)
	metaCapturedAt := uploadedAt.Add(-2 * time.Hour)

	if got := NormalizeCapturedAt(&metaCapturedAt, &modifiedAt, uploadedAt); !got.Equal(metaCapturedAt) {
		t.Fatalf("expected metadata time, got %v", got)
	}
	if got := NormalizeCapturedAt(nil, &modifiedAt, uploadedAt); !got.Equal(modifiedAt) {
		t.Fatalf("expected modified time, got %v", got)
	}
	if got := NormalizeCapturedAt(nil, nil, uploadedAt); !got.Equal(uploadedAt) {
		t.Fatalf("expected upload time, got %v", got)
	}
}

func TestParseCapturedAtMetadata(t *testing.T) {
	t.Run("parses zoned timestamps directly", func(t *testing.T) {
		got := ParseCapturedAtMetadata("2026-04-03T08:09:10+08:00", "UTC")
		if got == nil {
			t.Fatal("expected parsed timestamp")
		}
		want := time.Date(2026, 4, 3, 0, 9, 10, 0, time.UTC)
		if !got.Equal(want) {
			t.Fatalf("expected %v, got %v", want, *got)
		}
	})

	t.Run("parses local EXIF timestamps using album timezone", func(t *testing.T) {
		got := ParseCapturedAtMetadata("2026:04:03 08:09:10", "Asia/Shanghai")
		if got == nil {
			t.Fatal("expected parsed timestamp")
		}
		want := time.Date(2026, 4, 3, 0, 9, 10, 0, time.UTC)
		if !got.Equal(want) {
			t.Fatalf("expected %v, got %v", want, *got)
		}
	})

	t.Run("returns nil for blank input", func(t *testing.T) {
		if got := ParseCapturedAtMetadata("", "Asia/Shanghai"); got != nil {
			t.Fatalf("expected nil, got %v", *got)
		}
	})
}

func TestTimelineCursorRoundTrip(t *testing.T) {
	entry := domain.TimelineEntry{
		ID:         "entry-demo",
		DisplayAt:  time.Date(2026, 3, 27, 15, 4, 5, 123000000, time.UTC),
		UploadedAt: time.Date(2026, 3, 27, 15, 5, 6, 456000000, time.UTC),
	}

	cursorValue := encodeTimelineCursor(entry)
	cursor, err := decodeTimelineCursor(cursorValue)
	if err != nil {
		t.Fatalf("decodeTimelineCursor returned error: %v", err)
	}
	if !cursor.DisplayAt.Equal(entry.DisplayAt) {
		t.Fatalf("unexpected displayAt %v", cursor.DisplayAt)
	}
	if !cursor.UploadedAt.Equal(entry.UploadedAt) {
		t.Fatalf("unexpected uploadedAt %v", cursor.UploadedAt)
	}
	if cursor.EntryID != entry.ID {
		t.Fatalf("unexpected entry id %s", cursor.EntryID)
	}
}

func TestTimelineEntryPrecedesCursor(t *testing.T) {
	cursor := timelineCursor{
		DisplayAt:  time.Date(2026, 3, 27, 12, 0, 0, 0, time.UTC),
		UploadedAt: time.Date(2026, 3, 27, 12, 1, 0, 0, time.UTC),
		EntryID:    "entry-b",
	}
	tests := []struct {
		name  string
		entry domain.TimelineEntry
		want  bool
	}{
		{
			name: "older display time",
			entry: domain.TimelineEntry{
				ID:         "entry-z",
				DisplayAt:  cursor.DisplayAt.Add(-time.Minute),
				UploadedAt: cursor.UploadedAt.Add(time.Hour),
			},
			want: true,
		},
		{
			name: "same display older upload",
			entry: domain.TimelineEntry{
				ID:         "entry-z",
				DisplayAt:  cursor.DisplayAt,
				UploadedAt: cursor.UploadedAt.Add(-time.Minute),
			},
			want: true,
		},
		{
			name: "same timestamps lower id",
			entry: domain.TimelineEntry{
				ID:         "entry-a",
				DisplayAt:  cursor.DisplayAt,
				UploadedAt: cursor.UploadedAt,
			},
			want: true,
		},
		{
			name: "same timestamps higher id",
			entry: domain.TimelineEntry{
				ID:         "entry-c",
				DisplayAt:  cursor.DisplayAt,
				UploadedAt: cursor.UploadedAt,
			},
			want: false,
		},
		{
			name: "newer display time",
			entry: domain.TimelineEntry{
				ID:         "entry-a",
				DisplayAt:  cursor.DisplayAt.Add(time.Minute),
				UploadedAt: cursor.UploadedAt,
			},
			want: false,
		},
	}

	for _, test := range tests {
		if got := timelineEntryPrecedesCursor(test.entry, cursor); got != test.want {
			t.Fatalf("%s: expected %v, got %v", test.name, test.want, got)
		}
	}
}

func TestNormalizeTimelinePageLimit(t *testing.T) {
	if got := normalizeTimelinePageLimit(0); got != DefaultTimelinePageSize {
		t.Fatalf("expected default page size %d, got %d", DefaultTimelinePageSize, got)
	}
	if got := normalizeTimelinePageLimit(999); got != 50 {
		t.Fatalf("expected capped page size 50, got %d", got)
	}
	if got := normalizeTimelinePageLimit(10); got != 10 {
		t.Fatalf("expected page size 10, got %d", got)
	}
}
