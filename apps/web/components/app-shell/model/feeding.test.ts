import { describe, expect, it, vi } from "vitest";
import {
  buildFeedingDayStrip,
  buildFeedingSummary,
  buildFeedingSummaryCards,
  clampFeedingDayKey,
  extractFeedingDayKey,
  feedingEntryDetail,
  feedingEntryHeadline,
  feedingTodayDayKey,
  formatFeedingAgeForDayKey,
  formatFeedingDuration,
  formatFeedingRelative,
  formatFeedingWeekday,
  normalizeFeedingDayPayload,
  shiftFeedingDayKey,
  toDateTimeLocalValue
} from "./feeding";

describe("feeding helpers", () => {
  it("builds bounded day keys and clamps the selection", () => {
    expect(shiftFeedingDayKey("2026-04-01", -1)).toBe("2026-03-31");
    expect(buildFeedingDayStrip("2026-03-30", "2026-04-02")).toEqual(["2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02"]);
    expect(clampFeedingDayKey("2026-03-01", "2026-03-30", "2026-04-04")).toBe("2026-03-30");
    expect(clampFeedingDayKey("2026-04-20", "2026-03-30", "2026-04-04")).toBe("2026-04-04");
    expect(extractFeedingDayKey("2026-03-01T00:00:00.000Z")).toBe("2026-03-01");
  });

  it("formats today in a specific timezone", () => {
    const now = new Date("2026-04-01T00:30:00.000Z");
    expect(feedingTodayDayKey("Asia/Shanghai", now)).toBe("2026-04-01");
    expect(feedingTodayDayKey("America/Los_Angeles", now)).toBe("2026-03-31");
    expect(formatFeedingWeekday("2026-04-01", "2026-04-01")).toBe("今日");
  });

  it("formats age and durations", () => {
    expect(formatFeedingAgeForDayKey("2026-03-01T00:00:00.000Z", "2026-04-01")).toBe("1个月0天");
    expect(formatFeedingDuration(95)).toBe("1小时35分钟");
  });

  it("formats relative time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00.000Z"));
    expect(formatFeedingRelative("2026-04-01T11:55:00.000Z")).toBe("5分钟前");
    expect(formatFeedingRelative("2026-04-01T09:30:00.000Z")).toBe("2小时30分钟前");
    vi.useRealTimers();
  });

  it("builds summary cards and entry copy", () => {
    const cards = buildFeedingSummaryCards({
      milk: { count: 2, breastCount: 1, bottleCount: 1, formulaCount: 0, totalMl: 90, breastMinutes: 20 },
      diaper: { count: 1, stoolCount: 1 },
      solid: { count: 1 },
      supplement: { count: 1, itemCount: 2 },
      medicine: { count: 0, itemCount: 0 },
      sleep: { count: 1, totalMinutes: 120 }
    });
    expect(cards.map((card) => card.label)).toEqual(["亲喂", "瓶喂", "换尿布", "辅食", "营养品", "睡眠"]);
    expect(cards[0].value).toBe("20分钟");
    expect(cards[1].value).toBe("90ml");
    expect(cards[4].detail).toBe("");
    expect(cards[5].detail).toBe("2小时");
    expect(feedingEntryHeadline({
      id: "feed-1",
      albumId: "album-1",
      babyId: "baby-1",
      category: "medicine",
      occurredAt: "2026-04-01T01:00:00.000Z",
      dayKey: "2026-04-01",
      note: "",
      createdBy: "u1",
      createdAt: "2026-04-01T01:00:00.000Z",
      updatedAt: "2026-04-01T01:00:00.000Z",
      items: [{ id: "i1", entryId: "feed-1", name: "美林", dose: "5ml", sortOrder: 0, createdAt: "2026-04-01T01:00:00.000Z" }]
    })).toBe("药品");
    expect(feedingEntryDetail({
      id: "feed-1",
      albumId: "album-1",
      babyId: "baby-1",
      category: "medicine",
      occurredAt: "2026-04-01T01:00:00.000Z",
      dayKey: "2026-04-01",
      note: "",
      createdBy: "u1",
      createdAt: "2026-04-01T01:00:00.000Z",
      updatedAt: "2026-04-01T01:00:00.000Z",
      items: [{ id: "i1", entryId: "feed-1", name: "美林", dose: "5ml", sortOrder: 0, createdAt: "2026-04-01T01:00:00.000Z" }]
    })).toBe("美林 5ml");
  });

  it("normalizes payload ordering and datetime-local values", () => {
    const payload = normalizeFeedingDayPayload({
      day: "2026-04-01",
      summary: {
        milk: { count: 0, breastCount: 0, bottleCount: 0, formulaCount: 0, totalMl: 0, breastMinutes: 0 },
        diaper: { count: 0, stoolCount: 0 },
        solid: { count: 0 },
        supplement: { count: 0, itemCount: 0 },
        medicine: { count: 0, itemCount: 0 },
        sleep: { count: 0, totalMinutes: 0 }
      },
      entries: [
        {
          id: "a",
          albumId: "album-1",
          babyId: "baby-1",
          category: "solid",
          occurredAt: "2026-04-01T01:00:00.000Z",
          dayKey: "2026-04-01",
          note: "",
          createdBy: "u1",
          createdAt: "2026-04-01T01:00:00.000Z",
          updatedAt: "2026-04-01T01:00:00.000Z",
          items: []
        },
        {
          id: "b",
          albumId: "album-1",
          babyId: "baby-1",
          category: "solid",
          occurredAt: "2026-04-01T02:00:00.000Z",
          dayKey: "2026-04-01",
          note: "",
          createdBy: "u1",
          createdAt: "2026-04-01T02:00:00.000Z",
          updatedAt: "2026-04-01T02:00:00.000Z",
          items: []
        }
      ]
    });
    expect(payload.entries[0].id).toBe("b");
    expect(toDateTimeLocalValue("2026-04-01T08:30:00.000Z")).toMatch(/2026-04-01T/);
  });

  it("builds a local summary from entries", () => {
    const summary = buildFeedingSummary([
      {
        id: "milk-0",
        albumId: "album-1",
        babyId: "baby-1",
        category: "milk",
        milkMode: "breast",
        occurredAt: "2026-04-01T01:00:00.000Z",
        dayKey: "2026-04-01",
        note: "",
        createdBy: "u1",
        createdAt: "2026-04-01T01:00:00.000Z",
        updatedAt: "2026-04-01T01:00:00.000Z",
        items: []
      },
      {
        id: "milk-1",
        albumId: "album-1",
        babyId: "baby-1",
        category: "milk",
        milkMode: "formula",
        amountMl: 120,
        occurredAt: "2026-04-01T02:00:00.000Z",
        dayKey: "2026-04-01",
        note: "",
        createdBy: "u1",
        createdAt: "2026-04-01T02:00:00.000Z",
        updatedAt: "2026-04-01T02:00:00.000Z",
        items: []
      },
      {
        id: "supp-1",
        albumId: "album-1",
        babyId: "baby-1",
        category: "supplement",
        occurredAt: "2026-04-01T03:00:00.000Z",
        dayKey: "2026-04-01",
        note: "",
        createdBy: "u1",
        createdAt: "2026-04-01T03:00:00.000Z",
        updatedAt: "2026-04-01T03:00:00.000Z",
        items: [{ id: "item-1", entryId: "supp-1", name: "维生素D", dose: "1滴", sortOrder: 0, createdAt: "2026-04-01T03:00:00.000Z" }]
      }
    ]);

    expect(feedingEntryDetail({
      id: "milk-0",
      albumId: "album-1",
      babyId: "baby-1",
      category: "milk",
      milkMode: "breast",
      occurredAt: "2026-04-01T01:00:00.000Z",
      dayKey: "2026-04-01",
      note: "",
      createdBy: "u1",
      createdAt: "2026-04-01T01:00:00.000Z",
      updatedAt: "2026-04-01T01:00:00.000Z",
      items: []
    })).toBe("待补结束时间");
    expect(summary.milk.count).toBe(1);
    expect(summary.milk.totalMl).toBe(120);
    expect(summary.milk.formulaCount).toBe(1);
    expect(summary.milk.breastCount).toBe(0);
    expect(summary.supplement.count).toBe(1);
    expect(summary.supplement.itemCount).toBe(1);
  });
});
