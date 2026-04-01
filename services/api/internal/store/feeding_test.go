package store

import (
	"testing"
	"time"

	"babyalbum/api/internal/domain"
)

func TestPrepareFeedingEntry(t *testing.T) {
	family := domain.Family{ID: "family-1", Timezone: "Asia/Shanghai"}
	now := time.Now().UTC().Add(-time.Hour)
	endedAt := now.Add(20 * time.Minute)
	amount := 90
	hasStool := true

	t.Run("milk breast allows missing endedAt and clears unrelated fields", func(t *testing.T) {
		prepared, err := prepareFeedingEntry(
			family,
			domain.FeedingMilk,
			now,
			nil,
			" note ",
			domain.FeedingBreast,
			&amount,
			"米粉",
			&hasStool,
			[]FeedingEntryItemInput{{Name: "维生素D"}},
		)
		if err != nil {
			t.Fatalf("prepareFeedingEntry returned error: %v", err)
		}
		if prepared.AmountML != nil {
			t.Fatalf("expected breast milk to clear amount")
		}
		if prepared.FoodName != "" || prepared.HasStool != nil || len(prepared.Items) != 0 {
			t.Fatalf("expected unrelated fields cleared, got %+v", prepared)
		}
		if prepared.EndedAt != nil {
			t.Fatalf("expected breast milk to allow missing endedAt")
		}
	})

	t.Run("milk breast keeps endedAt when provided", func(t *testing.T) {
		prepared, err := prepareFeedingEntry(
			family,
			domain.FeedingMilk,
			now,
			&endedAt,
			"",
			domain.FeedingBreast,
			nil,
			"",
			nil,
			nil,
		)
		if err != nil {
			t.Fatalf("prepareFeedingEntry returned error: %v", err)
		}
		if prepared.EndedAt == nil || !prepared.EndedAt.Equal(endedAt.UTC()) {
			t.Fatalf("expected endedAt to be preserved")
		}
	})

	t.Run("supplement requires items and clears unrelated fields", func(t *testing.T) {
		prepared, err := prepareFeedingEntry(
			family,
			domain.FeedingSupplement,
			now,
			&endedAt,
			"",
			domain.FeedingBottle,
			&amount,
			"米粉",
			&hasStool,
			[]FeedingEntryItemInput{{Name: "  维生素D  ", Dose: "1滴"}, {Name: " ", Dose: "x"}},
		)
		if err != nil {
			t.Fatalf("prepareFeedingEntry returned error: %v", err)
		}
		if len(prepared.Items) != 1 || prepared.Items[0].Name != "维生素D" {
			t.Fatalf("expected normalized items, got %+v", prepared.Items)
		}
		if prepared.EndedAt != nil || prepared.AmountML != nil || prepared.MilkMode != "" || prepared.FoodName != "" || prepared.HasStool != nil {
			t.Fatalf("expected unrelated fields cleared, got %+v", prepared)
		}
	})

	t.Run("diaper requires stool value", func(t *testing.T) {
		if _, err := prepareFeedingEntry(family, domain.FeedingDiaper, now, nil, "", "", nil, "", nil, nil); err == nil {
			t.Fatal("expected missing stool value to fail")
		}
	})
}

func TestNullableFeedingMilkMode(t *testing.T) {
	if value := nullableFeedingMilkMode(""); value != nil {
		t.Fatalf("expected empty milk mode to serialize as nil, got %#v", value)
	}
	if value := nullableFeedingMilkMode(domain.FeedingBottle); value != "bottle" {
		t.Fatalf("expected bottle milk mode to serialize, got %#v", value)
	}
}

func TestSummarizeFeedingEntries(t *testing.T) {
	amount := 120
	hasStoolTrue := true
	hasStoolFalse := false
	now := time.Now().UTC()
	sleepEnd := now.Add(90 * time.Minute)
	breastEnd := now.Add(15 * time.Minute)

	summary := summarizeFeedingEntries([]domain.FeedingEntry{
		{Category: domain.FeedingMilk, MilkMode: domain.FeedingBottle, AmountML: &amount},
		{Category: domain.FeedingMilk, MilkMode: domain.FeedingBreast, OccurredAt: now},
		{Category: domain.FeedingMilk, MilkMode: domain.FeedingBreast, OccurredAt: now, EndedAt: &breastEnd},
		{Category: domain.FeedingDiaper, HasStool: &hasStoolTrue},
		{Category: domain.FeedingDiaper, HasStool: &hasStoolFalse},
		{Category: domain.FeedingSupplement, Items: []domain.FeedingEntryItem{{Name: "维生素D"}, {Name: "DHA"}}},
		{Category: domain.FeedingSleep, OccurredAt: now, EndedAt: &sleepEnd},
	})

	if summary.Milk.Count != 2 || summary.Milk.BreastCount != 1 || summary.Milk.TotalML != 120 || summary.Milk.BreastMinutes != 15 {
		t.Fatalf("unexpected milk summary %+v", summary.Milk)
	}
	if summary.Diaper.Count != 2 || summary.Diaper.StoolCount != 1 {
		t.Fatalf("unexpected diaper summary %+v", summary.Diaper)
	}
	if summary.Supplement.Count != 1 || summary.Supplement.ItemCount != 2 {
		t.Fatalf("unexpected supplement summary %+v", summary.Supplement)
	}
	if summary.Sleep.Count != 1 || summary.Sleep.TotalMinutes != 90 {
		t.Fatalf("unexpected sleep summary %+v", summary.Sleep)
	}
}
