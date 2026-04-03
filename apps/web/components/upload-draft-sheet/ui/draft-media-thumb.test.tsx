import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DraftMedia } from "../model/types";
import { DraftMediaThumb } from "./draft-media-thumb";

function buildMedia(overrides?: Partial<DraftMedia>): DraftMedia {
  return {
    id: "media-1",
    file: null,
    fileName: "moment.jpg",
    previewUrl: "blob:moment.jpg",
    capturedAt: "2026-04-03T08:00:00.000Z",
    mediaType: "image/jpeg",
    ...overrides
  };
}

describe("DraftMediaThumb", () => {
  it("renders images with img", () => {
    const { container } = render(createElement(DraftMediaThumb, { item: buildMedia() }));

    expect(screen.getByRole("img", { name: "moment.jpg" })).toBeVisible();
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders videos with video and a badge", () => {
    const { container } = render(createElement(DraftMediaThumb, {
      item: buildMedia({
        fileName: "clip.mp4",
        previewUrl: "blob:clip.mp4",
        mediaType: "video/mp4"
      })
    }));

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).not.toBeNull();
    expect(screen.getByText("视频")).toBeVisible();
  });
});
