"use client";

import { useEffect, useState } from "react";
import { createTimelineEntry, deleteTimelineEntry, deleteTimelineEntryMedia, getApiBaseUrl, updateTimelineEntry } from "../../../lib/api";
import type { TimelineEntry } from "../../../lib/types";
import { createClientId, draftDisplayAt } from "../model/drafts";
import type { DraftMedia, UploadDraft, UploadProgressState } from "../model/types";

interface UseUploadSubmitOptions {
  albumId: string;
  authToken: string;
  open: boolean;
  disabled?: boolean;
  disabledReason?: string;
  drafts: UploadDraft[];
  selectedDraft: UploadDraft | null;
  editingEntry?: TimelineEntry | null;
  originalMediaIds: Set<string>;
  onUploaded?: () => void;
  onDeleted?: () => void;
  onClose: () => void;
  setStatus: (value: string | null) => void;
}

export function useUploadSubmit({ albumId, authToken, open, disabled, disabledReason, drafts, selectedDraft, editingEntry, originalMediaIds, onUploaded, onDeleted, onClose, setStatus }: UseUploadSubmitOptions) {
  const apiBaseUrl = getApiBaseUrl();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const isEditMode = Boolean(editingEntry);

  useEffect(() => {
    setUploading(false);
    setUploadProgress(null);
  }, [albumId, authToken, editingEntry, open]);

  async function uploadFile(entryId: string, uploadBatchId: string, item: DraftMedia, onProgress?: (progress: { loaded: number; total: number; bytesPerSecond: number }) => void) {
    if (!item.file) {
      return;
    }
    const createResponse = await fetch(`${apiBaseUrl}/api/v1/upload-sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${authToken}`,
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
      xhr.open("POST", `${apiBaseUrl}/api/v1/upload-sessions/${createPayload.id}/content`);
      xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
      xhr.upload.onprogress = (event) => {
        const total = event.lengthComputable && event.total > 0 ? event.total : item.file?.size ?? 0;
        const elapsed = Math.max((performance.now() - startedAt) / 1000, 0.001);
        onProgress?.({
          loaded: event.loaded,
          total,
          bytesPerSecond: event.loaded / elapsed
        });
      };
      xhr.onerror = () => reject(new Error(`上传 ${item.fileName} 失败。`));
      xhr.onload = () => {
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
          onProgress?.({
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

  async function handleUploadAll() {
    if (disabled) {
      setStatus(disabledReason ?? "当前不可上传。");
      return;
    }
    if (drafts.length === 0) {
      setStatus("请先选择要上传的照片或视频。");
      return;
    }
    if (drafts.some((draft) => draft.items.length === 0)) {
      setStatus("每条记录至少保留一个文件。");
      return;
    }
    const pendingItems = isEditMode && selectedDraft
      ? selectedDraft.items.filter((item) => !item.existingMediaId && item.file)
      : drafts.flatMap((draft) => draft.items.filter((item) => item.file));
    const totalBytes = pendingItems.reduce((sum, item) => sum + (item.file?.size ?? 0), 0);
    const totalFiles = pendingItems.length;
    setUploading(true);
    setStatus(null);
    setUploadProgress({
      title: isEditMode ? "正在保存动态" : "准备上传",
      detail: isEditMode ? "正在同步说明和可见范围" : "正在创建上传任务",
      currentFileName: "",
      transferredBytes: 0,
      totalBytes,
      completedFiles: 0,
      totalFiles,
      bytesPerSecond: 0
    });
    try {
      let uploadedBytes = 0;
      let uploadedFiles = 0;
      if (isEditMode && editingEntry && selectedDraft) {
        setUploadProgress((current) => current ? {
          ...current,
          title: "正在保存动态",
          detail: "正在同步说明和可见范围",
          currentFileName: "",
          bytesPerSecond: 0
        } : current);
        const entry = await updateTimelineEntry(authToken, editingEntry.id, {
          albumId,
          caption: selectedDraft.caption,
          visibility: selectedDraft.visibility,
          timeMode: selectedDraft.timeMode,
          displayAt: draftDisplayAt(selectedDraft)
        });
        const keptMediaIds = new Set(selectedDraft.items.map((item) => item.existingMediaId).filter(Boolean) as string[]);
        for (const mediaId of Array.from(originalMediaIds)) {
          if (!keptMediaIds.has(mediaId)) {
            await deleteTimelineEntryMedia(authToken, albumId, entry.id, mediaId);
          }
        }
        const newItems = selectedDraft.items.filter((item) => !item.existingMediaId);
        const uploadBatchId = createClientId("batch");
        for (const [itemIndex, item] of newItems.entries()) {
          const fileSize = item.file?.size ?? 0;
          setUploadProgress((current) => current ? {
            ...current,
            title: "正在补传媒体",
            detail: `正在补传 ${itemIndex + 1} / ${newItems.length}`,
            currentFileName: item.fileName,
            transferredBytes: uploadedBytes,
            completedFiles: uploadedFiles,
            bytesPerSecond: 0
          } : current);
          await uploadFile(entry.id, uploadBatchId, item, (progress) => {
            setUploadProgress((current) => current ? {
              ...current,
              title: "正在补传媒体",
              detail: `正在补传 ${itemIndex + 1} / ${newItems.length}`,
              currentFileName: item.fileName,
              transferredBytes: uploadedBytes + progress.loaded,
              totalBytes: Math.max(current.totalBytes, uploadedBytes + progress.total),
              completedFiles: uploadedFiles,
              bytesPerSecond: progress.bytesPerSecond
            } : current);
          });
          uploadedBytes += fileSize;
          uploadedFiles += 1;
          setUploadProgress((current) => current ? {
            ...current,
            transferredBytes: uploadedBytes,
            completedFiles: uploadedFiles,
            bytesPerSecond: 0
          } : current);
        }
      } else {
        for (const [draftIndex, draft] of drafts.entries()) {
          setUploadProgress((current) => current ? {
            ...current,
            title: "正在创建记录",
            detail: `正在创建记录 ${draftIndex + 1} / ${drafts.length}`,
            currentFileName: "",
            bytesPerSecond: 0
          } : current);
          const entry = await createTimelineEntry(authToken, {
            albumId,
            caption: draft.caption,
            visibility: draft.visibility,
            timeMode: draft.timeMode,
            displayAt: draftDisplayAt(draft)
          });
          const uploadBatchId = createClientId("batch");
          for (const [itemIndex, item] of draft.items.entries()) {
            const fileSize = item.file?.size ?? 0;
            setUploadProgress((current) => current ? {
              ...current,
              title: "正在上传媒体",
              detail: `正在上传 ${draftIndex + 1}.${itemIndex + 1} / ${drafts.length}.${draft.items.length}`,
              currentFileName: item.fileName,
              transferredBytes: uploadedBytes,
              completedFiles: uploadedFiles,
              bytesPerSecond: 0
            } : current);
            await uploadFile(entry.id, uploadBatchId, item, (progress) => {
              setUploadProgress((current) => current ? {
                ...current,
                title: "正在上传媒体",
                detail: `正在上传 ${draftIndex + 1}.${itemIndex + 1} / ${drafts.length}.${draft.items.length}`,
                currentFileName: item.fileName,
                transferredBytes: uploadedBytes + progress.loaded,
                totalBytes: Math.max(current.totalBytes, uploadedBytes + progress.total),
                completedFiles: uploadedFiles,
                bytesPerSecond: progress.bytesPerSecond
              } : current);
            });
            uploadedBytes += fileSize;
            uploadedFiles += 1;
            setUploadProgress((current) => current ? {
              ...current,
              transferredBytes: uploadedBytes,
              completedFiles: uploadedFiles,
              bytesPerSecond: 0
            } : current);
          }
        }
      }
      setUploadProgress((current) => current ? {
        ...current,
        title: isEditMode ? "已保存" : "上传已提交",
        detail: isEditMode ? "动态已更新，媒体会继续由 NAS 处理。" : "上传任务已创建，媒体会继续由 NAS 处理。",
        currentFileName: "",
        transferredBytes: totalBytes,
        completedFiles: totalFiles,
        bytesPerSecond: 0
      } : current);
      onUploaded?.();
      window.setTimeout(() => {
        onClose();
      }, 420);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "上传失败。");
      setUploadProgress(null);
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteEntry() {
    if (!editingEntry) {
      return;
    }
    if (!window.confirm("确认删除这条动态吗？删除后不能恢复。")) {
      return;
    }
    setUploading(true);
    setStatus("正在删除这条动态");
    try {
      await deleteTimelineEntry(authToken, albumId, editingEntry.id);
      onDeleted?.();
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setUploading(false);
    }
  }

  return {
    uploading,
    uploadProgress,
    handleUploadAll,
    handleDeleteEntry
  };
}

export type UploadSubmitState = ReturnType<typeof useUploadSubmit>;
