"use client";

import { useEffect, useRef, useState } from "react";
import { createTimelineEntry, deleteTimelineEntry, deleteTimelineEntryMedia, getApiBaseUrl, updateTimelineEntry } from "../../../lib/api";
import { createClientId } from "../model/drafts";
import type {
  BackgroundUploadFailure,
  BackgroundUploadJob,
  BackgroundUploadJobDraft,
  BackgroundUploadJobMedia,
  BackgroundUploadState,
  UploadProgressState
} from "../model/types";

const SUCCESS_BADGE_MS = 1200;

const IDLE_UPLOAD_STATE: BackgroundUploadState = {
  phase: "idle",
  surface: "dialog",
  progress: null,
  errorMessage: "",
  failedItems: [],
  albumId: ""
};

type UploadableJobMedia = BackgroundUploadJobMedia & { file: File };

class UploadFileError extends Error {
  status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "UploadFileError";
    this.status = status;
  }
}

class UploadAbortedError extends Error {
  constructor() {
    super("上传已中断。");
    this.name = "UploadAbortedError";
  }
}

function getErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return 0;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : 0;
}

function isHardUploadError(error: unknown) {
  if (error instanceof UploadAbortedError) {
    return true;
  }
  const status = getErrorStatus(error);
  return status === 401 || status === 403;
}

function getUploadErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function getUploadableItems(items: BackgroundUploadJobMedia[]): UploadableJobMedia[] {
  return items.filter((item): item is UploadableJobMedia => item.file instanceof File);
}

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
    item: UploadableJobMedia,
    onProgress: (progress: { loaded: number; total: number; bytesPerSecond: number }) => void
  ) {
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
    const createRaw = await createResponse.text();
    let createPayload: { id?: string; error?: string } = {};
    if (createRaw) {
      try {
        createPayload = JSON.parse(createRaw) as { id?: string; error?: string };
      } catch {
        createPayload = { error: createRaw };
      }
    }
    if (!createResponse.ok || !createPayload.id) {
      throw new UploadFileError(createPayload.error ?? `创建 ${item.fileName} 的上传任务失败。`, createResponse.status);
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
        reject(new UploadFileError(`上传 ${item.fileName} 失败。`, xhr.status));
      };
      xhr.onabort = () => {
        activeXhrsRef.current.delete(xhr);
        reject(new UploadAbortedError());
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
        reject(new UploadFileError(payload.error ?? `上传 ${item.fileName} 失败。`, xhr.status));
      };
      xhr.send(formData);
    });
  }

  async function executeUpload(job: BackgroundUploadJob, runId: number) {
    const allUploadItems = job.drafts.flatMap((draft) => getUploadableItems(draft.items));
    const totalBytes = allUploadItems.reduce((sum, item) => sum + item.file.size, 0);
    const totalFiles = allUploadItems.length;
    const failedItems: BackgroundUploadFailure[] = [];
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

    const publishFailures = () => {
      if (runIdRef.current !== runId) {
        return;
      }
      applyState((current) => current.phase === "uploading" ? { ...current, failedItems: [...failedItems] } : current);
    };

    const recordFailure = (draft: BackgroundUploadJobDraft, item: UploadableJobMedia, error: unknown) => {
      const failure: BackgroundUploadFailure = {
        draftId: draft.id,
        itemId: item.id,
        fileName: item.fileName,
        message: getUploadErrorMessage(error, `上传 ${item.fileName} 失败。`)
      };
      failedItems.push(failure);
      publishFailures();
    };

    try {
      let processedBytes = 0;
      let processedFiles = 0;
      let successfulFiles = 0;
      let timelineChanged = false;

      const completeFileAttempt = (fileSize: number) => {
        processedBytes += fileSize;
        processedFiles += 1;
        updateProgress((current) => ({
          ...current,
          transferredBytes: Math.max(current.transferredBytes, processedBytes),
          totalBytes: Math.max(current.totalBytes, processedBytes),
          completedFiles: processedFiles,
          bytesPerSecond: 0
        }));
      };

      const tryUploadItem = async (input: {
        draft: BackgroundUploadJobDraft;
        entryId: string;
        uploadBatchId: string;
        item: UploadableJobMedia;
        title: string;
        detail: string;
      }) => {
        const fileSize = input.item.file.size;
        updateProgress((current) => ({
          ...current,
          title: input.title,
          detail: input.detail,
          currentFileName: input.item.fileName,
          transferredBytes: processedBytes,
          completedFiles: processedFiles,
          bytesPerSecond: 0
        }));
        try {
          await uploadFile(job.albumId, input.entryId, input.uploadBatchId, input.item, (fileProgress) => {
            if (runIdRef.current !== runId) {
              return;
            }
            updateProgress((current) => ({
              ...current,
              title: input.title,
              detail: input.detail,
              currentFileName: input.item.fileName,
              transferredBytes: processedBytes + fileProgress.loaded,
              totalBytes: Math.max(current.totalBytes, processedBytes + fileProgress.total),
              completedFiles: processedFiles,
              bytesPerSecond: fileProgress.bytesPerSecond
            }));
          });
          successfulFiles += 1;
          return true;
        } catch (error) {
          if (isHardUploadError(error)) {
            throw error;
          }
          recordFailure(input.draft, input.item, error);
          return false;
        } finally {
          completeFileAttempt(fileSize);
        }
      };

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
        timelineChanged = true;
        const keptMediaIds = new Set(draft.items.map((item) => item.existingMediaId).filter(Boolean) as string[]);
        const removedMediaIds = job.originalMediaIds.filter((mediaId) => !keptMediaIds.has(mediaId));
        const newItems = getUploadableItems(draft.items.filter((item) => !item.existingMediaId));
        const failureCountBeforeNewUploads = failedItems.length;
        const uploadBatchId = createClientId("batch");
        for (const [itemIndex, item] of newItems.entries()) {
          await tryUploadItem({
            draft,
            entryId: entry.id,
            uploadBatchId,
            item,
            title: "正在补传媒体",
            detail: `正在补传 ${itemIndex + 1} / ${newItems.length}`
          });
        }
        const newUploadFailed = failedItems.length > failureCountBeforeNewUploads;
        if (!newUploadFailed) {
          for (const mediaId of removedMediaIds) {
            if (runIdRef.current !== runId) {
              return;
            }
            await deleteTimelineEntryMedia(job.albumId, entry.id, mediaId);
          }
        }
      } else {
        for (const [draftIndex, draft] of job.drafts.entries()) {
          const draftUploadItems = getUploadableItems(draft.items);
          updateProgress((current) => ({
            ...current,
            title: "正在创建记录",
            detail: `正在创建记录 ${draftIndex + 1} / ${job.drafts.length}`,
            currentFileName: "",
            bytesPerSecond: 0
          }));
          let entry: Awaited<ReturnType<typeof createTimelineEntry>>;
          try {
            entry = await createTimelineEntry({
              albumId: job.albumId,
              caption: draft.caption,
              visibility: draft.visibility,
              timeMode: draft.timeMode,
              displayAt: jobDraftDisplayAt(draft)
            });
          } catch (error) {
            if (isHardUploadError(error) || draftUploadItems.length === 0) {
              throw error;
            }
            for (const item of draftUploadItems) {
              recordFailure(draft, item, error);
              completeFileAttempt(item.file.size);
            }
            continue;
          }
          if (draftUploadItems.length === 0) {
            timelineChanged = true;
            continue;
          }
          const successfulFilesBeforeDraft = successfulFiles;
          const uploadBatchId = createClientId("batch");
          for (const [itemIndex, item] of draftUploadItems.entries()) {
            await tryUploadItem({
              draft,
              entryId: entry.id,
              uploadBatchId,
              item,
              title: "正在上传媒体",
              detail: `正在上传 ${draftIndex + 1}.${itemIndex + 1} / ${job.drafts.length}.${draftUploadItems.length}`
            });
          }
          if (successfulFiles > successfulFilesBeforeDraft) {
            timelineChanged = true;
          } else {
            await deleteTimelineEntry(job.albumId, entry.id);
          }
        }
      }

      if (runIdRef.current !== runId) {
        return;
      }

      const finalTotalBytes = Math.max(progress.totalBytes, totalBytes, processedBytes);

      if (failedItems.length > 0) {
        if (timelineChanged) {
          job.onUploaded?.();
          const detail = successfulFiles > 0
            ? `已上传 ${successfulFiles} / ${totalFiles} 个文件，失败项已列在下方。`
            : "动态信息已保存，新增媒体未上传；为避免数据丢失，已保留原有媒体。";
          const message = `上传完成，${failedItems.length} 个文件未上传。`;
          progress = {
            ...progress,
            title: message,
            detail,
            currentFileName: "",
            transferredBytes: finalTotalBytes,
            totalBytes: finalTotalBytes,
            completedFiles: totalFiles,
            bytesPerSecond: 0
          };
          applyState({
            phase: "partial_success",
            surface: "dialog",
            progress,
            errorMessage: message,
            failedItems: [...failedItems],
            albumId: job.albumId
          });
          return;
        }

        const message = "没有文件上传成功。已尝试全部文件，未保留空动态。";
        progress = {
          ...progress,
          title: "没有文件上传成功",
          detail: message,
          currentFileName: "",
          transferredBytes: finalTotalBytes,
          totalBytes: finalTotalBytes,
          completedFiles: totalFiles,
          bytesPerSecond: 0
        };
        applyState({
          phase: "error",
          surface: "dialog",
          progress,
          errorMessage: message,
          failedItems: [...failedItems],
          albumId: job.albumId
        });
        return;
      }

      job.onUploaded?.();
      progress = {
        ...progress,
        title: job.mode === "edit" ? "已保存" : "上传已提交",
        detail: job.mode === "edit" ? "动态已更新，媒体会继续由 NAS 处理。" : "上传任务已创建，媒体会继续由 NAS 处理。",
        currentFileName: "",
        transferredBytes: finalTotalBytes,
        totalBytes: finalTotalBytes,
        completedFiles: totalFiles,
        bytesPerSecond: 0
      };
      applyState({
        phase: "success",
        surface: "minimized",
        progress,
        errorMessage: "",
        failedItems: [],
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
      const message = getUploadErrorMessage(error, "上传失败。");
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
        failedItems: [...failedItems],
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
    const allUploadItems = job.drafts.flatMap((draft) => getUploadableItems(draft.items));
    const initialProgress: UploadProgressState = {
      title: job.mode === "edit" ? "正在保存动态" : "准备上传",
      detail: job.mode === "edit" ? "正在同步说明和可见范围" : "正在创建上传任务",
      currentFileName: "",
      transferredBytes: 0,
      totalBytes: allUploadItems.reduce((sum, item) => sum + item.file.size, 0),
      completedFiles: 0,
      totalFiles: allUploadItems.length,
      bytesPerSecond: 0
    };
    applyState({
      phase: "uploading",
      surface: "dialog",
      progress: initialProgress,
      errorMessage: "",
      failedItems: [],
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
