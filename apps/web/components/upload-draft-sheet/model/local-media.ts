import type { UploadDraft } from "./types";

const LOCAL_VIDEO_POSTER_TARGET_SECONDS = 0.3;
const LOCAL_VIDEO_POSTER_MAX_EDGE = 640;
const LOCAL_VIDEO_POSTER_QUALITY = 0.82;

const previewUrlCache = new Map<string, string>();
const posterUrlCache = new Map<string, string>();
const posterTaskCache = new Map<string, Promise<string>>();
const resourceVersionCache = new Map<string, number>();

export function localMediaFileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
}

function mediaResourceVersion(key: string) {
  return resourceVersionCache.get(key) ?? 0;
}

function nextMediaResourceVersion(key: string) {
  const nextValue = mediaResourceVersion(key) + 1;
  resourceVersionCache.set(key, nextValue);
  return nextValue;
}

export function ensureLocalPreviewUrl(file: File) {
  const key = localMediaFileKey(file);
  const cached = previewUrlCache.get(key);
  if (cached) {
    return cached;
  }
  const nextUrl = URL.createObjectURL(file);
  previewUrlCache.set(key, nextUrl);
  return nextUrl;
}

async function renderLocalVideoPoster(previewUrl: string) {
  return new Promise<string>((resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    let cleanedUp = false;
    let targetTime = 0;

    function cleanup() {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }

    function fail(error: unknown) {
      cleanup();
      reject(error instanceof Error ? error : new Error("failed to generate video poster"));
    }

    function captureFrame() {
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) {
        fail(new Error("video dimensions unavailable"));
        return;
      }

      const scale = Math.min(1, LOCAL_VIDEO_POSTER_MAX_EDGE / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));

      const context = canvas.getContext("2d");
      if (!context) {
        fail(new Error("2d canvas unavailable"));
        return;
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) {
          fail(new Error("video poster blob unavailable"));
          return;
        }
        const posterUrl = URL.createObjectURL(blob);
        cleanup();
        resolve(posterUrl);
      }, "image/jpeg", LOCAL_VIDEO_POSTER_QUALITY);
    }

    video.onerror = () => fail(new Error("video poster load failed"));
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration <= 0) {
        targetTime = 0;
      } else {
        targetTime = Math.min(LOCAL_VIDEO_POSTER_TARGET_SECONDS, Math.max(video.duration * 0.1, 0.2));
        targetTime = Math.min(targetTime, Math.max(video.duration - 0.05, 0));
      }
      if (targetTime <= 0) {
        return;
      }
      try {
        video.currentTime = targetTime;
      } catch (error) {
        fail(error);
      }
    };
    video.onloadeddata = () => {
      if (targetTime <= 0) {
        captureFrame();
      }
    };
    video.onseeked = () => {
      if (targetTime > 0) {
        captureFrame();
      }
    };

    video.src = previewUrl;
    video.load();
  });
}

export async function ensureLocalVideoPosterUrl(file: File) {
  const key = localMediaFileKey(file);
  const cached = posterUrlCache.get(key);
  if (cached) {
    return cached;
  }

  const pendingTask = posterTaskCache.get(key);
  if (pendingTask) {
    return pendingTask;
  }

  const expectedVersion = mediaResourceVersion(key);
  const previewUrl = ensureLocalPreviewUrl(file);
  const task = renderLocalVideoPoster(previewUrl)
    .then((posterUrl) => {
      if (mediaResourceVersion(key) !== expectedVersion) {
        URL.revokeObjectURL(posterUrl);
        throw new Error("stale video poster");
      }
      posterUrlCache.set(key, posterUrl);
      return posterUrl;
    })
    .finally(() => {
      posterTaskCache.delete(key);
    });

  posterTaskCache.set(key, task);
  return task;
}

export function revokeLocalMediaResourcesForFile(file: File) {
  const key = localMediaFileKey(file);
  nextMediaResourceVersion(key);

  const previewUrl = previewUrlCache.get(key);
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrlCache.delete(key);
  }

  const posterUrl = posterUrlCache.get(key);
  if (posterUrl) {
    URL.revokeObjectURL(posterUrl);
    posterUrlCache.delete(key);
  }

  posterTaskCache.delete(key);
}

export function revokeDraftMediaResources(drafts: UploadDraft[]) {
  for (const draft of drafts) {
    for (const item of draft.items) {
      if (item.file) {
        revokeLocalMediaResourcesForFile(item.file);
      }
    }
  }
}
