import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BackgroundUploadJob } from "../model/types";
import { useBackgroundUpload } from "./use-background-upload";

const apiMocks = vi.hoisted(() => ({
  createTimelineEntry: vi.fn(),
  deleteTimelineEntry: vi.fn(),
  deleteTimelineEntryMedia: vi.fn(),
  getApiBaseUrl: vi.fn(() => "/api/proxy"),
  updateTimelineEntry: vi.fn()
}));

vi.mock("../../../lib/api", () => ({
  createTimelineEntry: apiMocks.createTimelineEntry,
  deleteTimelineEntry: apiMocks.deleteTimelineEntry,
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

  failWithStatus(status: number, error: string) {
    this.responseText = JSON.stringify({ error });
    this.succeed(status);
  }

  fail() {
    this.onerror?.call(this as unknown as XMLHttpRequest, new ProgressEvent("error"));
  }
}

const originalFetch = globalThis.fetch;
const originalXMLHttpRequest = globalThis.XMLHttpRequest;

function buildNewMedia(id: string, fileName: string): BackgroundUploadJob["drafts"][number]["items"][number] {
  return {
    id,
    file: new File([fileName], fileName, { type: "image/jpeg" }),
    fileName,
    capturedAt: "2026-03-20T08:00:00.000Z",
    mediaType: "image/jpeg"
  };
}

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
      items: [buildNewMedia("media-1", "hello.jpg")]
    }],
    originalMediaIds: [],
    ...overrides
  };
}

describe("useBackgroundUpload", () => {
  beforeEach(() => {
    FakeXMLHttpRequest.reset();
    apiMocks.createTimelineEntry.mockReset().mockResolvedValue({ id: "entry-1" });
    apiMocks.deleteTimelineEntry.mockReset().mockResolvedValue(undefined);
    apiMocks.updateTimelineEntry.mockReset().mockResolvedValue({ id: "entry-1" });
    apiMocks.deleteTimelineEntryMedia.mockReset().mockResolvedValue(undefined);
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    globalThis.fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: "session-1" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }))) as typeof fetch;
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
    expect(result.current.state.errorMessage).toContain("没有文件上传成功");
    expect(result.current.state.failedItems).toEqual([expect.objectContaining({
      fileName: "hello.jpg",
      message: "上传 hello.jpg 失败。"
    })]);
    expect(apiMocks.deleteTimelineEntry).toHaveBeenCalledWith("album-1", "entry-1");

    act(() => {
      result.current.clear();
    });
    expect(result.current.state.phase).toBe("idle");
  });

  it("continues uploading later files and reports partial success when one file fails", async () => {
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useBackgroundUpload());

    act(() => {
      result.current.startUpload(buildCreateJob({
        onUploaded,
        drafts: [{
          id: "draft-1",
          caption: "caption",
          visibility: "members",
          timeMode: "captured_at",
          manualDate: "",
          items: [
            buildNewMedia("media-1", "bad.jpg"),
            buildNewMedia("media-2", "good.jpg")
          ]
        }]
      }));
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => {
      FakeXMLHttpRequest.instances[0].failWithStatus(400, "unsupported media type");
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));
    act(() => {
      FakeXMLHttpRequest.instances[1].succeed();
    });

    await waitFor(() => expect(result.current.state.phase).toBe("partial_success"));
    expect(result.current.state.surface).toBe("dialog");
    expect(result.current.state.progress?.completedFiles).toBe(2);
    expect(result.current.state.failedItems).toEqual([expect.objectContaining({
      fileName: "bad.jpg",
      message: "unsupported media type"
    })]);
    expect(apiMocks.deleteTimelineEntry).not.toHaveBeenCalled();
    expect(onUploaded).toHaveBeenCalledTimes(1);
  });

  it("tries every file, cleans up the empty entry, and errors when all files fail", async () => {
    const { result } = renderHook(() => useBackgroundUpload());

    act(() => {
      result.current.startUpload(buildCreateJob({
        drafts: [{
          id: "draft-1",
          caption: "caption",
          visibility: "members",
          timeMode: "captured_at",
          manualDate: "",
          items: [
            buildNewMedia("media-1", "first.jpg"),
            buildNewMedia("media-2", "second.jpg")
          ]
        }]
      }));
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => {
      FakeXMLHttpRequest.instances[0].failWithStatus(400, "first failed");
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));
    act(() => {
      FakeXMLHttpRequest.instances[1].failWithStatus(400, "second failed");
    });

    await waitFor(() => expect(result.current.state.phase).toBe("error"));
    expect(FakeXMLHttpRequest.instances).toHaveLength(2);
    expect(result.current.state.errorMessage).toContain("没有文件上传成功");
    expect(result.current.state.progress?.completedFiles).toBe(2);
    expect(result.current.state.failedItems).toHaveLength(2);
    expect(apiMocks.deleteTimelineEntry).toHaveBeenCalledWith("album-1", "entry-1");
  });

  it("uses the edit flow to upload new files before deleting removed media", async () => {
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
    expect(apiMocks.deleteTimelineEntryMedia).not.toHaveBeenCalled();

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => {
      FakeXMLHttpRequest.instances[0].succeed();
    });
    await waitFor(() => expect(apiMocks.deleteTimelineEntryMedia).toHaveBeenCalledWith("album-1", "entry-1", "remove-1"));
    expect(apiMocks.deleteTimelineEntryMedia).not.toHaveBeenCalledWith("album-1", "entry-1", "keep-1");

    await waitFor(() => expect(result.current.state.phase).toBe("success"));
  });

  it("keeps old media when a new edit upload fails", async () => {
    const onUploaded = vi.fn();
    const { result } = renderHook(() => useBackgroundUpload());

    act(() => {
      result.current.startUpload(buildCreateJob({
        mode: "edit",
        editingEntryId: "entry-42",
        onUploaded,
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
            buildNewMedia("media-2", "new.jpg")
          ]
        }],
        originalMediaIds: ["keep-1", "remove-1"]
      }));
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => {
      FakeXMLHttpRequest.instances[0].failWithStatus(400, "unsupported media type");
    });

    await waitFor(() => expect(result.current.state.phase).toBe("partial_success"));
    expect(apiMocks.deleteTimelineEntryMedia).not.toHaveBeenCalled();
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(result.current.state.failedItems).toEqual([expect.objectContaining({
      fileName: "new.jpg",
      message: "unsupported media type"
    })]);
  });
});
