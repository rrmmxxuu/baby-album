import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaAsset } from "../../../lib/types";
import { loadOriginalStatus } from "../../../lib/api";
import { useLightboxOriginalImage } from "./use-lightbox-original-image";

vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>("../../../lib/api");
  return {
    ...actual,
    loadOriginalStatus: vi.fn()
  };
});

class FakeXMLHttpRequest {
  static instances: FakeXMLHttpRequest[] = [];

  method = "";
  url = "";
  status = 200;
  response: Blob | null = null;
  responseType: XMLHttpRequestResponseType = "";
  aborted = false;
  onloadstart: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
  onprogress: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
  onload: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
  onerror: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
  onabort: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;
  onloadend: ((this: XMLHttpRequest, ev: ProgressEvent<EventTarget>) => unknown) | null = null;

  static reset() {
    FakeXMLHttpRequest.instances = [];
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send() {
    FakeXMLHttpRequest.instances.push(this);
    this.onloadstart?.call(this as unknown as XMLHttpRequest, new ProgressEvent("loadstart"));
  }

  abort() {
    this.aborted = true;
    this.onabort?.call(this as unknown as XMLHttpRequest, new ProgressEvent("abort"));
    this.onloadend?.call(this as unknown as XMLHttpRequest, new ProgressEvent("loadend"));
  }

  emitProgress(loaded: number, total: number, lengthComputable = true) {
    this.onprogress?.call(
      this as unknown as XMLHttpRequest,
      new ProgressEvent("progress", { loaded, total, lengthComputable })
    );
  }

  succeed(blob: Blob, status = 200) {
    this.status = status;
    this.response = blob;
    this.onload?.call(this as unknown as XMLHttpRequest, new ProgressEvent("load"));
    this.onloadend?.call(this as unknown as XMLHttpRequest, new ProgressEvent("loadend"));
  }

  fail() {
    this.onerror?.call(this as unknown as XMLHttpRequest, new ProgressEvent("error"));
    this.onloadend?.call(this as unknown as XMLHttpRequest, new ProgressEvent("loadend"));
  }
}

const originalXMLHttpRequest = globalThis.XMLHttpRequest;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
const createObjectURL = vi.fn<(blob: Blob) => string>();
const revokeObjectURL = vi.fn<(url: string) => void>();
const mockedLoadOriginalStatus = vi.mocked(loadOriginalStatus);

function buildMedia(id: string): MediaAsset {
  return {
    id,
    albumId: "album-1",
    entryId: "entry-1",
    uploadBatchId: "batch-1",
    uploadedBy: "user-1",
    uploadedByName: "家人",
    fileName: `${id}.jpg`,
    mediaType: "image/jpeg",
    capturedAt: "2026-03-20T08:00:00.000Z",
    uploadedAt: "2026-03-20T08:30:00.000Z",
    timelineDay: "2026-03-20",
    status: "ready",
    source: "upload",
    width: 1200,
    height: 900,
    previewStatus: "ready",
    previewUrl: `https://album-api.example.com/api/v1/media/${id}/preview?sig=test`,
    originalUrl: `https://album-api.example.com/api/v1/media/${id}/original?sig=test`,
    originalAvailability: "hot",
    processedAt: "2026-03-20T08:40:00.000Z"
  };
}

describe("useLightboxOriginalImage", () => {
  beforeEach(() => {
    let objectUrlId = 0;
    FakeXMLHttpRequest.reset();
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    mockedLoadOriginalStatus.mockReset();
    mockedLoadOriginalStatus.mockResolvedValue({
      originalAvailability: "hot",
      originalUrl: "https://album-api.example.com/api/v1/media/media-1/original?sig=refreshed",
      media: buildMedia("media-1")
    });
    createObjectURL.mockReset();
    revokeObjectURL.mockReset();
    createObjectURL.mockImplementation(() => `blob:${++objectUrlId}`);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: createObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: revokeObjectURL
    });
  });

  afterEach(() => {
    globalThis.XMLHttpRequest = originalXMLHttpRequest;
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      writable: true,
      value: originalCreateObjectURL
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      writable: true,
      value: originalRevokeObjectURL
    });
  });

  it("starts downloading the current image and reports progress until the blob URL is ready", async () => {
    const item = buildMedia("media-1");
    const { result } = renderHook(({ currentItem }) => useLightboxOriginalImage({ albumId: "album-1", currentItem }), {
      initialProps: { currentItem: item }
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    const request = FakeXMLHttpRequest.instances[0];
    expect(result.current.status).toBe("loading");

    act(() => request.emitProgress(50, 100));
    expect(result.current.progress).toBe(0.5);
    expect(result.current.loadedBytes).toBe(50);
    expect(result.current.totalBytes).toBe(100);

    act(() => request.succeed(new Blob(["original-image"])));
    expect(result.current.status).toBe("loaded");
    expect(result.current.objectUrl).toBe("blob:1");
    expect(result.current.progress).toBe(1);
  });

  it("keeps an earlier image download running while another image becomes current", async () => {
    const first = buildMedia("media-1");
    const second = buildMedia("media-2");
    const { result, rerender } = renderHook(({ currentItem }) => useLightboxOriginalImage({ albumId: "album-1", currentItem }), {
      initialProps: { currentItem: first }
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    const firstRequest = FakeXMLHttpRequest.instances[0];
    act(() => firstRequest.emitProgress(40, 100));
    expect(result.current.progress).toBe(0.4);

    rerender({ currentItem: second });
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));
    expect(firstRequest.aborted).toBe(false);

    act(() => firstRequest.emitProgress(70, 100));
    rerender({ currentItem: first });
    expect(result.current.status).toBe("loading");
    expect(result.current.progress).toBe(0.7);
  });

  it("retries an image download after a failure when the user revisits that image", async () => {
    const first = buildMedia("media-1");
    const second = buildMedia("media-2");
    const { result, rerender } = renderHook(({ currentItem }) => useLightboxOriginalImage({ albumId: "album-1", currentItem }), {
      initialProps: { currentItem: first }
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => FakeXMLHttpRequest.instances[0].fail());
    expect(result.current.status).toBe("error");

    rerender({ currentItem: second });
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));

    rerender({ currentItem: first });
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(3));
    expect(FakeXMLHttpRequest.instances[2].url).toContain("/api/v1/media/media-1/original");
  });

  it("refreshes the original URL after a 401 response instead of requiring a full app reload", async () => {
    const item = buildMedia("media-1");
    item.originalUrl = "https://album-api.example.com/api/v1/media/media-1/original?exp=1&sig=expired";
    const { result } = renderHook(({ currentItem }) => useLightboxOriginalImage({ albumId: "album-1", currentItem }), {
      initialProps: { currentItem: item }
    });

    await waitFor(() => expect(mockedLoadOriginalStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    expect(FakeXMLHttpRequest.instances[0].url).toContain("sig=refreshed");

    act(() => FakeXMLHttpRequest.instances[0].succeed(new Blob(["fresh-original"])));
    expect(result.current.status).toBe("loaded");
    expect(result.current.objectUrl).toBe("blob:1");
  });

  it("retries with a refreshed signed URL when the original request returns 401", async () => {
    const item = buildMedia("media-1");
    item.originalUrl = "https://album-api.example.com/api/v1/media/media-1/original?exp=9999999999&sig=stale";
    const { result } = renderHook(({ currentItem }) => useLightboxOriginalImage({ albumId: "album-1", currentItem }), {
      initialProps: { currentItem: item }
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    expect(FakeXMLHttpRequest.instances[0].url).toContain("sig=stale");

    act(() => FakeXMLHttpRequest.instances[0].succeed(new Blob(['{"error":"unauthorized"}'], { type: "application/json" }), 401));
    await waitFor(() => expect(mockedLoadOriginalStatus).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));
    expect(FakeXMLHttpRequest.instances[1].url).toContain("sig=refreshed");

    act(() => FakeXMLHttpRequest.instances[1].succeed(new Blob(["fresh-original"])));
    expect(result.current.status).toBe("loaded");
    expect(result.current.objectUrl).toBe("blob:1");
  });

  it("aborts in-flight requests and revokes cached blob URLs on unmount", async () => {
    const first = buildMedia("media-1");
    const second = buildMedia("media-2");
    const { rerender, unmount } = renderHook(({ currentItem }) => useLightboxOriginalImage({ albumId: "album-1", currentItem }), {
      initialProps: { currentItem: first }
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => FakeXMLHttpRequest.instances[0].succeed(new Blob(["loaded"])));

    rerender({ currentItem: second });
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));
    const pendingRequest = FakeXMLHttpRequest.instances[1];

    unmount();

    expect(pendingRequest.aborted).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });

  it("evicts older loaded originals once the cache exceeds the allowed size", async () => {
    const items = [buildMedia("media-1"), buildMedia("media-2"), buildMedia("media-3"), buildMedia("media-4")];
    const { rerender } = renderHook(({ currentItem }) => useLightboxOriginalImage({ albumId: "album-1", currentItem }), {
      initialProps: { currentItem: items[0] }
    });

    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(1));
    act(() => FakeXMLHttpRequest.instances[0].succeed(new Blob(["one"])));

    rerender({ currentItem: items[1] });
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(2));
    act(() => FakeXMLHttpRequest.instances[1].succeed(new Blob(["two"])));

    rerender({ currentItem: items[2] });
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(3));
    act(() => FakeXMLHttpRequest.instances[2].succeed(new Blob(["three"])));

    rerender({ currentItem: items[3] });
    await waitFor(() => expect(FakeXMLHttpRequest.instances).toHaveLength(4));
    act(() => FakeXMLHttpRequest.instances[3].succeed(new Blob(["four"])));

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:1");
  });
});
