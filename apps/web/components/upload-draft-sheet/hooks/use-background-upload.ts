"use client";

import { useEffect, useRef, useState } from "react";
import { createTimelineEntry, deleteTimelineEntryMedia, getApiBaseUrl, updateTimelineEntry } from "../../../lib/api";
import { createClientId } from "../model/drafts";
import type { BackgroundUploadJob, BackgroundUploadJobDraft, BackgroundUploadState, UploadProgressState } from "../model/types";

const SUCCESS_BADGE_MS = 1200;

const IDLE_UPLOAD_STATE: BackgroundUploadState = {
  phase: "idle",
  surface: "dialog",
  progress: null,
  errorMessage: "",
  albumId: ""
};

function jobDraftDisplayAt(draft: BackgroundUploadJobDraft) {
  switch (draft.timeMode) {
    case "uploaded_at":
      return new Date().toISOString();
    case "manual":
      return new Date(`${draft.manualDate}T12:00:00`).toISOString();
    default:
      return [...draft.items].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))[0]?.capturedAt ?? new Date().toISOString();
  }
}

export function useBackgroundUpload() {
  const apiBaseUrl = getApiBaseUrl();
  const mountedRef = useRef(false);
  const runIdRef = useRef(0);
  const successTimerRef = useRef<number | null>(null);
  const activeXhrsRef = useRef<Set<XMLHttpRequest>>(new Set());
  const stateRef = useRef<BackgroundUploadState>(IDLE_UPLOAD_STATE);
  const [state, setState] = useState<BackgroundUploadState>(IDLE_UPLOAD_STATE);

  function applyState(next: BackgroundUploadState | ((current: BackgroundUploadState) => BackgroundUploadState)) {
    const resolve = typeof next === "function" ? next : () => next;
    if (!mountedRef.current) {
      stateRef.current = resolve(stateRef.current);
      return;
    }
    setState((current) => {
      const resolved = resolve(current);
      stateRef.current = resolved;
      return resolved;
    });
  }

  function clearSuccessTimer() {
    if (successTimerRef.current !== null) {
      window.clearTimeout(successTimerRef.current);
      successTimerRef.current = null;
    }
  }

  function abortActiveRequests() {
    for (const xhr of Array.from(activeXhrsRef.current)) {
      activeXhrsRef.current.delete(xhr);
      xhr.upload.onprogress = null;
      xhr.onerror = null;
      xhr.onload = null;
      xhr.onabort = null;
      xhr.abort();
    }
  }

  function clear() {
    clearSuccessTimer();
    applyState(IDLE_UPLOAD_STATE);
  }

  function minimize() {
    applyState((current) => current.phase === "uploading" ? { ...current, surface: "minimized" } : current);
  }

  function openDialog() {
    applyState((current) => current.phase === "idle" ? current : { ...current, surface: "dialog" });
  }

  async function uploadFile(
    albumId: string,
    entryId: string,
    uploadBatchId: string,
    item: BackgroundUploadJob["drafts"][number]["items"][number],
    onProgress: (progress: { loaded: number; total: number; bytesPerSecond: number }) => void
  ) {
    if (!item.file) {
      return;
    }

    const createResponse = await fetch(`${apiBaseUrl}/api/v1/upload-sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        albumId,
        entryId,
        uploadBatchId,
        fileName: item.fileName,
        mediaType: item.mediaType,
        capturedAt: item.capturedAt
      })
    });
    const createPayload = await createResponse.json() as { id?: string; error?: string };
    if (!createResponse.ok || !createPayload.id) {
      throw new Error(createPayload.error ?? `创建 ${item.fileName} 的上传任务失败。`);
    }

    const formData = new FormData();
    formData.append("file", item.file);

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const startedAt = performance.now();
      activeXhrsRef.current.add(xhr);
      xhr.open("POST", `${apiBaseUrl}/api/v1/upload-sessions/${createPayload.id}/content`);
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable && event.total > 0 ? event.total : item.file?.size ?? 0;
        const elapsed = Math.max((performance.now() - startedAt) / 1000, 0.001);
        onProgress({
          loaded: event.loaded,
          total,
          bytesPerSecond: event.loaded / elapsed
        });
      };
      xhr.onerror = () => {
        activeXhrsRef.current.delete(xhr);
        reject(new Error(`上传 ${item.fileName} 失败。`));
      };
      xhr.onabort = () => {
        activeXhrsRef.current.delete(xhr);
        reject(new Error("上传已中断。"));
      };
      xhr.onload = () => {
        activeXhrsRef.current.delete(xhr);
        const responseText = xhr.responseText?.trim();
        let payload: { error?: string } = {};
        if (responseText) {
          try {
            payload = JSON.parse(responseText) as { error?: string };
          } catch {
            payload = {};
          }
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          const total = item.file?.size ?? 0;
          const elapsed = Math.max((performance.now() - startedAt) / 1000, 0.001);
          onProgress({
            loaded: total,
            total,
            bytesPerSecond: total / elapsed
          });
          resolve();
          return;
        }
        reject(new Error(payload.error ?? `上传 ${item.fileName} 失败。`));
      };
      xhr.send(formData);
    });
  }

  async function executeUpload(job: BackgroundUploadJob, runId: number) {
    const totalBytes = job.drafts.flatMap((draft) => draft.items).reduce((sum, item) => sum + (item.file?.size ?? 0), 0);
    const totalFiles = job.drafts.flatMap((draft) => draft.items).filter((item) => item.file).length;
    let progress: UploadProgressState = {
      title: job.mode === "edit" ? "正在保存动态" : "准备上传",
      detail: job.mode === "edit" ? "正在同步说明和可见范围" : "正在创建上传任务",
      currentFileName: "",
      transferredBytes: 0,
      totalBytes,
      completedFiles: 0,
      totalFiles,
      bytesPerSecond: 0
    };

    const updateProgress = (recipe: (current: UploadProgressState) => UploadProgressState) => {
      progress = recipe(progress);
      if (runIdRef.current !== runId) {
        return;
      }
      applyState((current) => current.phase === "uploading" ? { ...current, progress } : current);
    };

    try {
      let uploadedBytes = 0;
      let uploadedFiles = 0;

      if (job.mode === "edit") {
        const draft = job.drafts[0];
        if (!draft || !job.editingEntryId) {
          throw new Error("缺少需要保存的动态。");
        }
        updateProgress((current) => ({
          ...current,
          title: "正在保存动态",
          detail: "正在同步说明和可见范围",
          currentFileName: "",
          bytesPerSecond: 0
        }));
        const entry = await updateTimelineEntry(job.editingEntryId, {
          albumId: job.albumId,
          caption: draft.caption,
          visibility: draft.visibility,
          timeMode: draft.timeMode,
          displayAt: jobDraftDisplayAt(draft)
        });
        const keptMediaIds = new Set(draft.items.map((item) => item.existingMediaId).filter(Boolean) as string[]);
        for (const mediaId of job.originalMediaIds) {
          if (!keptMediaIds.has(mediaId)) {
            await deleteTimelineEntryMedia(job.albumId, entry.id, mediaId);
          }
        }
        const newItems = draft.items.filter((item) => !item.existingMediaId);
        const uploadBatchId = createClientId("batch");
        for (const [itemIndex, item] of newItems.entries()) {
          const fileSize = item.file?.size ?? 0;
          updateProgress((current) => ({
            ...current,
            title: "正在补传媒体",
            detail: `正在补传 ${itemIndex + 1} / ${newItems.length}`,
            currentFileName: item.fileName,
            transferredBytes: uploadedBytes,
            completedFiles: uploadedFiles,
            bytesPerSecond: 0
          }));
          await uploadFile(job.albumId, entry.id, uploadBatchId, item, (fileProgress) => {
            if (runIdRef.current !== runId) {
              return;
            }
            updateProgress((current) => ({
              ...current,
              title: "正在补传媒体",
              detail: `正在补传 ${itemIndex + 1} / ${newItems.length}`,
              currentFileName: item.fileName,
              transferredBytes: uploadedBytes + fileProgress.loaded,
              totalBytes: Math.max(current.totalBytes, uploadedBytes + fileProgress.total),
              completedFiles: uploadedFiles,
              bytesPerSecond: fileProgress.bytesPerSecond
            }));
          });
          uploadedBytes += fileSize;
          uploadedFiles += 1;
          updateProgress((current) => ({
            ...current,
            transferredBytes: uploadedBytes,
            completedFiles: uploadedFiles,
            bytesPerSecond: 0
          }));
        }
      } else {
        for (const [draftIndex, draft] of job.drafts.entries()) {
          updateProgress((current) => ({
            ...current,
            title: "正在创建记录",
            detail: `正在创建记录 ${draftIndex + 1} / ${job.drafts.length}`,
            currentFileName: "",
            bytesPerSecond: 0
          }));
          const entry = await createTimelineEntry({
            albumId: job.albumId,
            caption: draft.caption,
            visibility: draft.visibility,
            timeMode: draft.timeMode,
            displayAt: jobDraftDisplayAt(draft)
          });
          const uploadBatchId = createClientId("batch");
          for (const [itemIndex, item] of draft.items.entries()) {
            const fileSize = item.file?.size ?? 0;
            updateProgress((current) => ({
              ...current,
              title: "正在上传媒体",
              detail: `正在上传 ${draftIndex + 1}.${itemIndex + 1} / ${job.drafts.length}.${draft.items.length}`,
              currentFileName: item.fileName,
              transferredBytes: uploadedBytes,
              completedFiles: uploadedFiles,
              bytesPerSecond: 0
            }));
            await uploadFile(job.albumId, entry.id, uploadBatchId, item, (fileProgress) => {
              if (runIdRef.current !== runId) {
                return;
              }
              updateProgress((current) => ({
                ...current,
                title: "正在上传媒体",
                detail: `正在上传 ${draftIndex + 1}.${itemIndex + 1} / ${job.drafts.length}.${draft.items.length}`,
                currentFileName: item.fileName,
                transferredBytes: uploadedBytes + fileProgress.loaded,
                totalBytes: Math.max(current.totalBytes, uploadedBytes + fileProgress.total),
                completedFiles: uploadedFiles,
                bytesPerSecond: fileProgress.bytesPerSecond
              }));
            });
            uploadedBytes += fileSize;
            uploadedFiles += 1;
            updateProgress((current) => ({
              ...current,
              transferredBytes: uploadedBytes,
              completedFiles: uploadedFiles,
              bytesPerSecond: 0
            }));
          }
        }
      }

      if (runIdRef.current !== runId) {
        return;
      }

      job.onUploaded?.();
      progress = {
        ...progress,
        title: job.mode === "edit" ? "已保存" : "上传已提交",
        detail: job.mode === "edit" ? "动态已更新，媒体会继续由 NAS 处理。" : "上传任务已创建，媒体会继续由 NAS 处理。",
        currentFileName: "",
        transferredBytes: totalBytes,
        completedFiles: totalFiles,
        bytesPerSecond: 0
      };
      applyState({
        phase: "success",
        surface: "minimized",
        progress,
        errorMessage: "",
        albumId: job.albumId
      });
      clearSuccessTimer();
      successTimerRef.current = window.setTimeout(() => {
        if (runIdRef.current === runId) {
          clear();
        }
      }, SUCCESS_BADGE_MS);
    } catch (error) {
      if (runIdRef.current !== runId) {
        return;
      }
      const message = error instanceof Error ? error.message : "上传失败。";
      applyState({
        phase: "error",
        surface: "dialog",
        progress: {
          ...progress,
          title: "上传失败",
          detail: message,
          bytesPerSecond: 0
        },
        errorMessage: message,
        albumId: job.albumId
      });
    }
  }

  function startUpload(job: BackgroundUploadJob) {
    if (stateRef.current.phase !== "idle") {
      return false;
    }
    clearSuccessTimer();
    abortActiveRequests();
    runIdRef.current += 1;
    const runId = runIdRef.current;
    const initialProgress: UploadProgressState = {
      title: job.mode === "edit" ? "正在保存动态" : "准备上传",
      detail: job.mode === "edit" ? "正在同步说明和可见范围" : "正在创建上传任务",
      currentFileName: "",
      transferredBytes: 0,
      totalBytes: job.drafts.flatMap((draft) => draft.items).reduce((sum, item) => sum + (item.file?.size ?? 0), 0),
      completedFiles: 0,
      totalFiles: job.drafts.flatMap((draft) => draft.items).filter((item) => item.file).length,
      bytesPerSecond: 0
    };
    applyState({
      phase: "uploading",
      surface: "dialog",
      progress: initialProgress,
      errorMessage: "",
      albumId: job.albumId
    });
    void executeUpload(job, runId);
    return true;
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearSuccessTimer();
      runIdRef.current += 1;
      abortActiveRequests();
    };
  }, []);

  return {
    state,
    hasTask: state.phase !== "idle",
    startUpload,
    minimize,
    openDialog,
    clear
  };
}

export type BackgroundUploadController = ReturnType<typeof useBackgroundUpload>;
