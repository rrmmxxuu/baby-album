"use client";

import { useEffect, useRef, useState } from "react";
import { getOriginalUrl } from "../../../lib/api";
import type { MediaAsset } from "../../../lib/types";

const MAX_RECENT_COMPLETED_ORIGINALS = 2;

type OriginalImageTaskStatus = "idle" | "loading" | "loaded" | "error";

type OriginalImageTask = {
  mediaId: string;
  status: OriginalImageTaskStatus;
  loadedBytes: number;
  totalBytes: number;
  progress: number | null;
  objectUrl: string;
  xhr: XMLHttpRequest | null;
  lastAccessedAt: number;
};

export type LightboxOriginalImageState = {
  status: OriginalImageTaskStatus;
  loadedBytes: number;
  totalBytes: number;
  progress: number | null;
  objectUrl: string;
};

interface UseLightboxOriginalImageOptions {
  albumId: string;
  currentItem: MediaAsset;
}

function createTask(mediaId: string): OriginalImageTask {
  return {
    mediaId,
    status: "idle",
    loadedBytes: 0,
    totalBytes: 0,
    progress: null,
    objectUrl: "",
    xhr: null,
    lastAccessedAt: Date.now()
  };
}

function toSnapshot(task?: OriginalImageTask): LightboxOriginalImageState {
  if (!task) {
    return {
      status: "idle",
      loadedBytes: 0,
      totalBytes: 0,
      progress: null,
      objectUrl: ""
    };
  }
  return {
    status: task.status,
    loadedBytes: task.loadedBytes,
    totalBytes: task.totalBytes,
    progress: task.progress,
    objectUrl: task.objectUrl
  };
}

export function useLightboxOriginalImage({ albumId, currentItem }: UseLightboxOriginalImageOptions) {
  const tasksRef = useRef<Map<string, OriginalImageTask>>(new Map());
  const mountedRef = useRef(false);
  const currentMediaIdRef = useRef(currentItem.id);
  const [, setVersion] = useState(0);

  function publish() {
    if (!mountedRef.current) {
      return;
    }
    setVersion((value) => value + 1);
  }

  function releaseXhr(task: OriginalImageTask, xhr: XMLHttpRequest) {
    if (task.xhr === xhr) {
      task.xhr = null;
    }
    xhr.onloadstart = null;
    xhr.onprogress = null;
    xhr.onload = null;
    xhr.onerror = null;
    xhr.onabort = null;
    xhr.onloadend = null;
  }

  function revokeObjectUrl(objectUrl: string) {
    if (!objectUrl) {
      return;
    }
    URL.revokeObjectURL(objectUrl);
  }

  function removeTask(task: OriginalImageTask) {
    const xhr = task.xhr;
    if (xhr) {
      releaseXhr(task, xhr);
      xhr.abort();
    }
    revokeObjectUrl(task.objectUrl);
    tasksRef.current.delete(task.mediaId);
  }

  function pruneTasks() {
    const currentMediaId = currentMediaIdRef.current;
    const loadedTasks = Array.from(tasksRef.current.values())
      .filter((task) => task.status === "loaded" && task.objectUrl);
    const keep = new Set<string>();

    if (currentMediaId) {
      const currentTask = tasksRef.current.get(currentMediaId);
      if (currentTask?.status === "loaded" && currentTask.objectUrl) {
        keep.add(currentMediaId);
      }
    }

    loadedTasks
      .filter((task) => task.mediaId !== currentMediaId)
      .sort((left, right) => right.lastAccessedAt - left.lastAccessedAt)
      .slice(0, MAX_RECENT_COMPLETED_ORIGINALS)
      .forEach((task) => keep.add(task.mediaId));

    for (const task of Array.from(tasksRef.current.values())) {
      if (task.status === "error" && task.mediaId !== currentMediaId) {
        tasksRef.current.delete(task.mediaId);
        continue;
      }
      if (task.status === "loaded" && task.objectUrl && !keep.has(task.mediaId)) {
        removeTask(task);
      }
    }
  }

  function finalizeAsError(task: OriginalImageTask, xhr: XMLHttpRequest) {
    if (task.xhr !== xhr) {
      return;
    }
    releaseXhr(task, xhr);
    task.status = "error";
    task.loadedBytes = 0;
    task.totalBytes = 0;
    task.progress = null;
    revokeObjectUrl(task.objectUrl);
    task.objectUrl = "";
    publish();
  }

  function finalizeAsLoaded(task: OriginalImageTask, xhr: XMLHttpRequest) {
    if (task.xhr !== xhr) {
      return;
    }
    if (xhr.status < 200 || xhr.status >= 300 || !(xhr.response instanceof Blob)) {
      finalizeAsError(task, xhr);
      return;
    }

    releaseXhr(task, xhr);
    const objectUrl = URL.createObjectURL(xhr.response);
    task.status = "loaded";
    task.loadedBytes = task.totalBytes > 0 ? task.totalBytes : xhr.response.size;
    task.totalBytes = task.totalBytes > 0 ? task.totalBytes : xhr.response.size;
    task.progress = 1;
    task.lastAccessedAt = Date.now();
    revokeObjectUrl(task.objectUrl);
    task.objectUrl = objectUrl;
    pruneTasks();
    publish();
  }

  function startDownload(item: MediaAsset) {
    if (!item.mediaType.startsWith("image/")) {
      return;
    }

    const existing = tasksRef.current.get(item.id);
    const task = existing ?? createTask(item.id);
    task.lastAccessedAt = Date.now();
    if (!existing) {
      tasksRef.current.set(item.id, task);
    }

    if (task.status === "loading" || task.status === "loaded") {
      pruneTasks();
      publish();
      return;
    }

    revokeObjectUrl(task.objectUrl);
    task.objectUrl = "";
    task.status = "loading";
    task.loadedBytes = 0;
    task.totalBytes = 0;
    task.progress = null;

    const xhr = new XMLHttpRequest();
    task.xhr = xhr;
    xhr.responseType = "blob";

    xhr.onloadstart = () => {
      if (task.xhr !== xhr) {
        return;
      }
      task.loadedBytes = 0;
      task.totalBytes = 0;
      task.progress = null;
      publish();
    };

    xhr.onprogress = (event) => {
      if (task.xhr !== xhr) {
        return;
      }
      task.loadedBytes = event.loaded;
      task.totalBytes = event.lengthComputable ? event.total : 0;
      task.progress = event.lengthComputable && event.total > 0 ? event.loaded / event.total : null;
      publish();
    };

    xhr.onload = () => finalizeAsLoaded(task, xhr);
    xhr.onerror = () => finalizeAsError(task, xhr);
    xhr.onabort = () => {
      if (task.xhr !== xhr) {
        return;
      }
      releaseXhr(task, xhr);
      tasksRef.current.delete(task.mediaId);
      publish();
    };

    xhr.open("GET", getOriginalUrl(item.id, albumId));
    xhr.send();
    publish();
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      for (const task of Array.from(tasksRef.current.values())) {
        removeTask(task);
      }
      tasksRef.current.clear();
    };
  }, []);

  useEffect(() => {
    currentMediaIdRef.current = currentItem.id;
    const currentTask = tasksRef.current.get(currentItem.id);
    if (currentTask) {
      currentTask.lastAccessedAt = Date.now();
    }
    pruneTasks();
    startDownload(currentItem);
  }, [albumId, currentItem.id, currentItem.mediaType]);

  return toSnapshot(tasksRef.current.get(currentItem.id));
}
