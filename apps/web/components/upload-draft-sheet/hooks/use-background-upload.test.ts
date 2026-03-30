import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundUploadJob } from "../model/types";
import { useBackgroundUpload } from "./use-background-upload";

const apiMocks = vi.hoisted(() => ({
  createTimelineEntry: vi.fn(),
  deleteTimelineEntryMedia: vi.fn(),
  getApiBaseUrl: vi.fn(() => "/api/proxy"),
  updateTimelineEntry: vi.fn()
}));

vi.mock("../../../lib/api", () => ({
  createTimelineEntry: apiMocks.createTimelineEntry,
  deleteTimelineEntryMedia: apiMocks.deleteTimelineEntryMedia,
  getApiBaseUrl: apiMocks.getApiBaseUrl,
  updateTimelineEntry: apiMocks.updateTimelineEntry
}));

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  status = 200;
  responseText = "";
  onload: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
  onerror: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
  onabort: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
  upload = {
    onprogress: null as ((event: ProgressEvent<EventTarget>) => unknown) | null
  };

  static reset() {
    FakeXMLHttpRequest.instances = [];
  }

  open() {
    return undefined;
  }

  send() {
    FakeXMLHttpRequest.instances.push(this);
  }

  abort() {
    this.onabort?.call(this as unknown as XMLHttpRequest, new ProgressEvent("abort"));
  }

  emitProgress(loaded: number, total: number, lengthComputable = true) {
    this.upload.onprogress?.(new ProgressEvent("progress", { loaded, total, lengthComputable }));
  }

  succeed(status = 200) {
    this.status = status;
    this.onload?.call(this as unknown as XMLHttpRequest, new ProgressEvent("load"));
  }

  fail() {
    this.onerror?.call(this as unknown as XMLHttpRequest, new ProgressEvent("error"));
  }
}

const originalFetch = globalThis.fetch;
const originalXMLHttpRequest = globalThis.XMLHttpRequest;

function buildCreateJob(overrides?: Partial<BackgroundUploadJob>): BackgroundUploadJob {
  return {
    albumId: "album-1",
    mode: "create",
    drafts: [{
      id: "draft-1",
      caption: "caption",
      visibility: "members",
      timeMode: "captured_at",
      manualDate: "",
      items: [{
        id: "media-1",
        file: new File(["hello"], "hello.jpg", { type: "image/jpeg" }),
        fileName: "hello.jpg",
        capturedAt: "2026-03-20T08:00:00.000Z",
        mediaType: "image/jpeg"
      }]
    }],
    originalMediaIds: [],
    ...overrides
  };
}

describe("useBackgroundUpload", () => {
  beforeEach(() => {
    FakeXMLHttpRequest.reset();
    apiMocks.createTimelineEntry.mockReset().mockResolvedValue({ id: "entry-1" });
    apiMocks.updateTimelineEntry.mockReset().mockResolvedValue({ id: "entry-1" });
    apiMocks.deleteTimelineEntryMedia.mockReset().mockResolvedValue(undefined);
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "session-1" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
  });

  it("starts a background upload, supports minimize/reopen, and auto-clears after success", async () => {
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useBackgroundUpload());

    let started = false;
    act(() => {
      started = result.current.startUpload(buildCreateJob({ onUploaded }));
    });
    expect(started).toBe(true);
    expect(result.current.state.phase).toBe("uploading");
    expect(result.current.state.surface).toBe("dialog");

    act(() => {
      result.current.minimize();
    });
    expect(result.current.state.surface).toBe("minimized");

    act(() => {
      result.current.openDialog();
    });
    expect(result.current.state.surface).toBe("dialog");

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => {
      FakeXMLHttpRequest.instances[0].emitProgress(3, 5);
    });
    expect(result.current.state.progress?.transferredBytes).toBe(3);

    act(() => {
      FakeXMLHttpRequest.instances[0].succeed();
    });

    await waitFor(() => expect(result.current.state.phase).toBe("success"));
    expect(result.current.state.surface).toBe("minimized");
    expect(onUploaded).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => window.setTimeout(resolve, 1300));
    await waitFor(() => expect(result.current.state.phase).toBe("idle"));
  });

  it("moves into an error dialog when upload content fails", async () => {
    const { result } = renderHook(() => useBackgroundUpload());

    act(() => {
      result.current.startUpload(buildCreateJob());
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => {
      FakeXMLHttpRequest.instances[0].fail();
    });

    await waitFor(() => expect(result.current.state.phase).toBe("error"));
    expect(result.current.state.surface).toBe("dialog");
    expect(result.current.state.errorMessage).toContain("上传 hello.jpg 失败");

    act(() => {
      result.current.clear();
    });
    expect(result.current.state.phase).toBe("idle");
  });

  it("uses the edit flow to update the entry and delete removed media before uploading new files", async () => {
    const { result } = renderHook(() => useBackgroundUpload());

    act(() => {
      result.current.startUpload(buildCreateJob({
        mode: "edit",
        editingEntryId: "entry-42",
        drafts: [{
          id: "draft-1",
          caption: "updated",
          visibility: "members",
          timeMode: "captured_at",
          manualDate: "",
          items: [
            {
              id: "existing-1",
              file: null,
              fileName: "old.jpg",
              capturedAt: "2026-03-20T08:00:00.000Z",
              mediaType: "image/jpeg",
              existingMediaId: "keep-1"
            },
            {
              id: "media-2",
              file: new File(["new"], "new.jpg", { type: "image/jpeg" }),
              fileName: "new.jpg",
              capturedAt: "2026-03-20T09:00:00.000Z",
              mediaType: "image/jpeg"
            }
          ]
        }],
        originalMediaIds: ["keep-1", "remove-1"]
      }));
    });

    await waitFor(() => expect(apiMocks.updateTimelineEntry).toHaveBeenCalledWith("entry-42", expect.objectContaining({
      albumId: "album-1",
      caption: "updated"
    })));
    expect(apiMocks.deleteTimelineEntryMedia).toHaveBeenCalledWith("album-1", "entry-1", "remove-1");
    expect(apiMocks.deleteTimelineEntryMedia).not.toHaveBeenCalledWith("album-1", "entry-1", "keep-1");

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => {
      FakeXMLHttpRequest.instances[0].succeed();
    });
    await waitFor(() => expect(result.current.state.phase).toBe("success"));
  });
});
