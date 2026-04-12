import { createElement } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftMedia } from "../model/types";
import { DraftMediaThumb } from "./draft-media-thumb";

const localMediaMocks = vi.hoisted(() => ({
  ensureLocalPreviewUrl: vi.fn((file: File) => `blob:${file.name}`),
  ensureLocalVideoPosterUrl: vi.fn(() => Promise.resolve("blob:clip-poster.jpg"))
}));

vi.mock("../model/local-media", () => ({
  ensureLocalPreviewUrl: localMediaMocks.ensureLocalPreviewUrl,
  ensureLocalVideoPosterUrl: localMediaMocks.ensureLocalVideoPosterUrl
}));

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
  beforeEach(() => {
    localMediaMocks.ensureLocalPreviewUrl.mockClear();
    localMediaMocks.ensureLocalVideoPosterUrl.mockClear();
  });

  it("renders images with img", () => {
    const { container } = render(createElement(DraftMediaThumb, { item: buildMedia() }));

    expect(screen.getByRole("img", { name: "moment.jpg" })).toBeVisible();
    expect(container.querySelector("video")).toBeNull();
  });

  it("renders local videos with a generated poster and a badge", async () => {
    const { container } = render(createElement(DraftMediaThumb, {
      item: buildMedia({
        file: new File(["video"], "clip.mp4", { type: "video/mp4" }),
        fileName: "clip.mp4",
        mediaType: "video/mp4"
      })
    }));

    expect(screen.getByText("视频")).toBeVisible();
    await waitFor(() => expect(container.querySelector("video")).not.toBeNull());
    await waitFor(() => expect(container.querySelector("video")).toHaveAttribute("poster", "blob:clip-poster.jpg"));
  });

  it("renders existing videos with a preview image instead of a broken video source", () => {
    const { container } = render(createElement(DraftMediaThumb, {
      item: buildMedia({
        file: null,
        fileName: "clip.mp4",
        previewUrl: "https://example.com/clip-preview.jpg",
        mediaType: "video/mp4"
      })
    }));

    expect(screen.getByRole("img", { name: "clip.mp4" })).toBeVisible();
    expect(container.querySelector("video")).toBeNull();
  });
});
