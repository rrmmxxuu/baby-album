import { describe, expect, it } from "vitest";
import { buildDuplicateTargetSignature, collectDraftDuplicateTargets } from "./duplicates";
import type { UploadDraft } from "./types";

function buildDraft(items: UploadDraft["items"]): UploadDraft {
  return {
    id: "draft-1",
    caption: "",
    visibility: "members",
    timeMode: "captured_at",
    manualDate: "2026-03-29",
    items
  };
}

describe("draft duplicate helpers", () => {
  it("collects only local image files for duplicate checks", () => {
    const imageFile = new File(["image"], "a.jpg", { type: "image/jpeg", lastModified: 100 });
    const videoFile = new File(["video"], "clip.mp4", { type: "video/mp4", lastModified: 200 });
    const drafts = [
      buildDraft([
        { id: "image", file: imageFile, fileName: imageFile.name, previewUrl: "blob:a.jpg", capturedAt: new Date().toISOString(), mediaType: imageFile.type, localPreview: true },
        { id: "video", file: videoFile, fileName: videoFile.name, previewUrl: "blob:clip.mp4", capturedAt: new Date().toISOString(), mediaType: videoFile.type, localPreview: true },
        { id: "existing", file: null, fileName: "old.jpg", previewUrl: "http://example.com/old.jpg", capturedAt: new Date().toISOString(), mediaType: "image/jpeg", existingMediaId: "media-1" }
      ])
    ];

    const targets = collectDraftDuplicateTargets(drafts);

    expect(targets).toHaveLength(1);
    expect(targets[0].itemId).toBe("image");
    expect(buildDuplicateTargetSignature(targets)).toContain("draft-1:image:");
  });
});
