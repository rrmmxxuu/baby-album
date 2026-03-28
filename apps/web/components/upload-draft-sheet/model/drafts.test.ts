import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDrafts, draftDisplayAt, mergeDrafts } from "./drafts";

describe("upload draft helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
      revokeObjectURL: vi.fn()
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("groups photos by day and keeps a video as a single draft", () => {
    const files = [
      new File(["a"], "a.jpg", { type: "image/jpeg", lastModified: new Date("2026-03-27T08:00:00.000Z").getTime() }),
      new File(["b"], "b.jpg", { type: "image/jpeg", lastModified: new Date("2026-03-27T09:00:00.000Z").getTime() }),
      new File(["c"], "clip.mp4", { type: "video/mp4", lastModified: new Date("2026-03-26T10:00:00.000Z").getTime() })
    ];

    const drafts = buildDrafts(files);

    expect(drafts).toHaveLength(2);
    expect(drafts.find((draft) => draft.items.length === 2)?.manualDate).toBe("2026-03-27");
    expect(drafts.find((draft) => draft.items[0].mediaType.startsWith("video/"))?.items).toHaveLength(1);
  });

  it("merges incoming photo drafts into available batches", () => {
    const existing = buildDrafts([
      new File(["a"], "a.jpg", { type: "image/jpeg", lastModified: new Date("2026-03-27T08:00:00.000Z").getTime() })
    ]);
    const incoming = buildDrafts([
      new File(["b"], "b.jpg", { type: "image/jpeg", lastModified: new Date("2026-03-27T09:00:00.000Z").getTime() })
    ]);

    const merged = mergeDrafts(existing, incoming);

    expect(merged).toHaveLength(1);
    expect(merged[0].items).toHaveLength(2);
  });

  it("derives display time from the draft mode", () => {
    const [draft] = buildDrafts([
      new File(["a"], "a.jpg", { type: "image/jpeg", lastModified: new Date("2026-03-27T08:00:00.000Z").getTime() })
    ]);

    expect(draftDisplayAt({ ...draft, timeMode: "manual", manualDate: "2026-03-20" })).toBe(new Date("2026-03-20T12:00:00").toISOString());
  });
});
