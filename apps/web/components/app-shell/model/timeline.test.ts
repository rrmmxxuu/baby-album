import { describe, expect, it } from "vitest";
import { buildRelationLabels, buildTimelineFeed, canEditTimelineEntry, moveLightbox } from "./timeline";
import type { LightboxState } from "./types";

describe("app-shell timeline helpers", () => {
  it("builds relation labels for members with explicit relations", () => {
    expect(buildRelationLabels([
      { userId: "u1", relation: "妈妈" },
      { userId: "u2", relation: undefined }
    ] as never)).toEqual({ u1: "妈妈" });
  });

  it("groups timeline entries by day and sorts batches descending", () => {
    const result = buildTimelineFeed([
      {
        id: "entry-1",
        albumId: "album-1",
        caption: "较晚上传",
        visibility: "members",
        timeMode: "captured_at",
        displayAt: "2026-03-27T10:00:00.000Z",
        timelineDay: "2026-03-27",
        uploadedBy: "u1",
        uploadedByName: "User 1",
        uploadedAt: "2026-03-27T10:00:00.000Z",
        createdAt: "2026-03-27T10:00:00.000Z",
        comments: [],
        items: [{
          id: "media-1",
          albumId: "album-1",
          entryId: "entry-1",
          uploadBatchId: "batch-1",
          uploadedBy: "u1",
          uploadedByName: "User 1",
          fileName: "a.jpg",
          mediaType: "image/jpeg",
          capturedAt: "2026-03-27T09:00:00.000Z",
          uploadedAt: "2026-03-27T10:00:00.000Z",
          timelineDay: "2026-03-27",
          status: "ready",
          source: "upload",
          width: 1,
          height: 1,
          previewStatus: "ready"
        }]
      },
      {
        id: "entry-2",
        albumId: "album-1",
        caption: "较早上传",
        visibility: "members",
        timeMode: "captured_at",
        displayAt: "2026-03-27T08:00:00.000Z",
        timelineDay: "2026-03-27",
        uploadedBy: "u2",
        uploadedByName: "User 2",
        uploadedAt: "2026-03-27T08:00:00.000Z",
        createdAt: "2026-03-27T08:00:00.000Z",
        comments: [],
        items: [{
          id: "media-2",
          albumId: "album-1",
          entryId: "entry-2",
          uploadBatchId: "batch-2",
          uploadedBy: "u2",
          uploadedByName: "User 2",
          fileName: "b.jpg",
          mediaType: "image/jpeg",
          capturedAt: "2026-03-27T07:30:00.000Z",
          uploadedAt: "2026-03-27T08:00:00.000Z",
          timelineDay: "2026-03-27",
          status: "ready",
          source: "upload",
          width: 1,
          height: 1,
          previewStatus: "ready"
        }]
      }
    ], "2026-03-01T00:00:00.000Z", { u1: "妈妈", u2: "爸爸" });

    expect(result).toHaveLength(1);
    expect(result[0].batches.map((batch) => batch.caption)).toEqual(["较晚上传", "较早上传"]);
    expect(result[0].batches[0].uploadedByName).toBe("妈妈");
    expect(result[0].babyAgeLabel).toBe("26天");
  });

  it("uses the detailed age label format for timeline day headers", () => {
    const result = buildTimelineFeed([
      {
        id: "entry-3",
        albumId: "album-1",
        caption: "两岁了",
        visibility: "members",
        timeMode: "captured_at",
        displayAt: "2026-03-12T10:00:00.000Z",
        timelineDay: "2026-03-12",
        uploadedBy: "u1",
        uploadedByName: "User 1",
        uploadedAt: "2026-03-12T10:00:00.000Z",
        createdAt: "2026-03-12T10:00:00.000Z",
        comments: [],
        items: [{
          id: "media-3",
          albumId: "album-1",
          entryId: "entry-3",
          uploadBatchId: "batch-3",
          uploadedBy: "u1",
          uploadedByName: "User 1",
          fileName: "c.jpg",
          mediaType: "image/jpeg",
          capturedAt: "2026-03-12T09:00:00.000Z",
          uploadedAt: "2026-03-12T10:00:00.000Z",
          timelineDay: "2026-03-12",
          status: "ready",
          source: "upload",
          width: 1,
          height: 1,
          previewStatus: "ready"
        }]
      }
    ], "2024-03-10T00:00:00.000Z", { u1: "妈妈" });

    expect(result[0].babyAgeLabel).toBe("2岁0个月2天");
  });

  it("checks edit permissions and lightbox navigation", () => {
    expect(canEditTimelineEntry("admin", undefined, "u1")).toBe(true);
    expect(canEditTimelineEntry("member", "u1", "u1")).toBe(true);
    expect(canEditTimelineEntry("member", "u1", "u2")).toBe(false);

    const lightbox: LightboxState = {
      albumId: "album-1",
      index: 0,
      batch: {
        batchId: "batch-1",
        uploadedBy: "u1",
        uploadedAt: "2026-03-27T10:00:00.000Z",
        uploadedByName: "妈妈",
        caption: "",
        visibility: "members",
        timeMode: "captured_at",
        displayAt: "2026-03-27T10:00:00.000Z",
        timelineDay: "2026-03-27",
        entry: {} as never,
        items: [{ id: "1" }, { id: "2" }] as never
      }
    };

    expect(moveLightbox(lightbox, 1).index).toBe(1);
    expect(moveLightbox(lightbox, -1).index).toBe(0);
    expect(moveLightbox({ ...lightbox, index: 1 }, 1).index).toBe(1);
  });
});
