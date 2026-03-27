"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createTimelineEntry, deleteTimelineEntry, deleteTimelineEntryMedia, getApiBaseUrl, getPreviewUrl, updateTimelineEntry } from "../lib/api";
import type { MediaAsset, TimelineEntry, TimelineTimeMode, TimelineVisibility } from "../lib/types";

type DraftMedia = {
  id: string;
  file: File | null;
  fileName: string;
  previewUrl: string;
  capturedAt: string;
  mediaType: string;
  existingMediaId?: string;
  localPreview?: boolean;
};

type UploadDraft = {
  id: string;
  caption: string;
  visibility: TimelineVisibility;
  timeMode: TimelineTimeMode;
  manualDate: string;
  items: DraftMedia[];
};

type UploadProgressState = {
  title: string;
  detail: string;
  currentFileName: string;
  transferredBytes: number;
  totalBytes: number;
  completedFiles: number;
  totalFiles: number;
  bytesPerSecond: number;
};

interface UploadDraftSheetProps {
  albumId: string;
  authToken: string;
  babyName?: string;
  open: boolean;
  disabled?: boolean;
  disabledReason?: string;
  editingEntry?: TimelineEntry | null;
  onClose: () => void;
  onUploaded?: () => void;
  onDeleted?: () => void;
}

function createClientId(prefix: string) {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${randomPart}`;
}

function toCapturedAt(file: File) {
  return new Date(file.lastModified || Date.now()).toISOString();
}

function toLocalDay(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function draftDayLabel(value: string) {
  const target = new Date(`${value}T00:00:00`);
  const now = new Date();
  if (target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth() && target.getDate() === now.getDate()) {
    return "今天";
  }
  return value;
}

function chunkItems<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function buildDrafts(files: File[]) {
  const drafts: UploadDraft[] = [];
  const photosByDay = new Map<string, DraftMedia[]>();

  for (const file of files) {
    const capturedAt = toCapturedAt(file);
    const media: DraftMedia = {
      id: createClientId("media"),
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      capturedAt,
      mediaType: file.type || "application/octet-stream",
      localPreview: true
    };
    if (media.mediaType.startsWith("video/")) {
      drafts.push({
        id: createClientId("draft"),
        caption: "",
        visibility: "members",
        timeMode: "captured_at",
        manualDate: toLocalDay(capturedAt),
        items: [media]
      });
      continue;
    }
    const day = toLocalDay(capturedAt);
    const existing = photosByDay.get(day) ?? [];
    existing.push(media);
    photosByDay.set(day, existing);
  }

  for (const [day, items] of Array.from(photosByDay.entries()).sort((left, right) => right[0].localeCompare(left[0]))) {
    for (const group of chunkItems(items, 9)) {
      drafts.push({
        id: createClientId("draft"),
        caption: "",
        visibility: "members",
        timeMode: "captured_at",
        manualDate: day,
        items: group.sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))
      });
    }
  }

  return drafts.sort((left, right) => draftDisplayAt(right).localeCompare(draftDisplayAt(left)));
}

function buildDraftFromEntry(entry: TimelineEntry, albumId: string, authToken: string): UploadDraft {
  return {
    id: entry.id,
    caption: entry.caption,
    visibility: entry.visibility,
    timeMode: entry.timeMode,
    manualDate: entry.timelineDay,
    items: entry.items.map((item) => ({
      id: createClientId("media"),
      file: null,
      fileName: item.fileName,
      previewUrl: getPreviewUrl(item.id, albumId, authToken, item.processedAt ?? item.uploadedAt),
      capturedAt: item.capturedAt,
      mediaType: item.mediaType,
      existingMediaId: item.id
    }))
  };
}

function mergeDrafts(existingDrafts: UploadDraft[], incomingDrafts: UploadDraft[]) {
  const merged: UploadDraft[] = existingDrafts.map((draft) => ({
    ...draft,
    items: [...draft.items]
  }));

  for (const incoming of incomingDrafts) {
    const isSingleVideo = incoming.items.length === 1 && incoming.items[0].mediaType.startsWith("video/");
    if (isSingleVideo) {
      merged.push(incoming);
      continue;
    }

    const targetDrafts = merged
      .filter((draft) => draft.timeMode === "captured_at" && draft.manualDate === incoming.manualDate && draft.items.every((item) => !item.mediaType.startsWith("video/")))
      .sort((left, right) => left.items.length - right.items.length);

    for (const item of incoming.items) {
      const target = targetDrafts.find((draft) => draft.items.length < 9);
      if (target) {
        target.items.push(item);
      } else {
        const nextDraft: UploadDraft = {
          ...incoming,
          id: createClientId("draft"),
          items: [item]
        };
        merged.push(nextDraft);
        targetDrafts.push(nextDraft);
      }
    }
  }

  for (const draft of merged) {
    draft.items.sort((left, right) => left.capturedAt.localeCompare(right.capturedAt));
  }
  return merged.sort((left, right) => draftDisplayAt(right).localeCompare(draftDisplayAt(left)));
}

function draftDisplayAt(draft: UploadDraft) {
  switch (draft.timeMode) {
    case "uploaded_at":
      return new Date().toISOString();
    case "manual":
      return new Date(`${draft.manualDate}T12:00:00`).toISOString();
    default:
      return [...draft.items].sort((left, right) => left.capturedAt.localeCompare(right.capturedAt))[0]?.capturedAt ?? new Date().toISOString();
  }
}

function visibilityLabel(value: TimelineVisibility) {
  return value === "managers" ? "仅管理员和所有者" : "相册成员可见";
}

function timeModeLabel(value: TimelineTimeMode) {
  switch (value) {
    case "uploaded_at":
      return "按当前时间";
    case "manual":
      return "手动选择日期";
    default:
      return "按拍摄时间";
  }
}

function revokeDrafts(items: UploadDraft[]) {
  for (const draft of items) {
    for (const item of draft.items) {
      if (item.localPreview) {
        URL.revokeObjectURL(item.previewUrl);
      }
    }
  }
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatTransferRate(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return "--";
  }
  return `${formatBytes(bytesPerSecond)}/s`;
}

function progressPercent(progress: UploadProgressState) {
  if (progress.totalBytes > 0) {
    return Math.min(100, Math.round((progress.transferredBytes / progress.totalBytes) * 100));
  }
  if (progress.totalFiles > 0) {
    return Math.min(100, Math.round((progress.completedFiles / progress.totalFiles) * 100));
  }
  return 0;
}

export function UploadDraftSheet({ albumId, authToken, babyName, open, disabled, disabledReason, editingEntry, onClose, onUploaded, onDeleted }: UploadDraftSheetProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appendInputRef = useRef<HTMLInputElement | null>(null);
  const editAppendInputRef = useRef<HTMLInputElement | null>(null);
  const apiBaseUrl = getApiBaseUrl();
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [batchSettingsOpen, setBatchSettingsOpen] = useState(false);
  const [batchVisibility, setBatchVisibility] = useState<TimelineVisibility>("members");
  const [batchTimeMode, setBatchTimeMode] = useState<TimelineTimeMode>("captured_at");
  const [batchManualDate, setBatchManualDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const isEditMode = Boolean(editingEntry);

  const selectedDraft = drafts.find((item) => item.id === selectedDraftId) ?? drafts[0] ?? null;
  const totalFiles = useMemo(() => drafts.reduce((sum, draft) => sum + draft.items.length, 0), [drafts]);
  const originalMediaIds = useMemo(() => new Set(editingEntry?.items.map((item) => item.id) ?? []), [editingEntry]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editingEntry) {
      const initialDraft = buildDraftFromEntry(editingEntry, albumId, authToken);
      setDrafts([initialDraft]);
      setSelectedDraftId(initialDraft.id);
      setEditorOpen(true);
      setBatchSettingsOpen(false);
      setStatus(null);
      setUploading(false);
      setUploadProgress(null);
      return;
    }
    setDrafts([]);
    setSelectedDraftId("");
    setEditorOpen(false);
    setBatchSettingsOpen(false);
    setStatus(null);
    setUploading(false);
    setUploadProgress(null);
  }, [albumId, authToken, editingEntry, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (drafts.length > 0 && !selectedDraftId) {
      setSelectedDraftId(drafts[0].id);
    }
  }, [drafts, open, selectedDraftId]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function resetDrafts() {
    revokeDrafts(drafts);
    setDrafts([]);
    setSelectedDraftId("");
    setEditorOpen(false);
    setBatchSettingsOpen(false);
    setStatus(null);
    setUploading(false);
    setUploadProgress(null);
  }

  function closeSheet() {
    resetDrafts();
    onClose();
  }

  function updateDraft(draftId: string, recipe: (draft: UploadDraft) => UploadDraft) {
    setDrafts((current) => current.map((draft) => draft.id === draftId ? recipe(draft) : draft));
  }

  function appendFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }
    const nextDrafts = buildDrafts(files);
    setDrafts((current) => {
      const merged = mergeDrafts(current, nextDrafts);
      if (!selectedDraftId && merged[0]) {
        setSelectedDraftId(merged[0].id);
      }
      return merged;
    });
    setStatus(null);
  }

  function removeDraftItem(draftId: string, itemId: string) {
    setDrafts((current) => {
      const next = current
        .map((draft) => {
          if (draft.id !== draftId) {
            return draft;
          }
          const removedItem = draft.items.find((item) => item.id === itemId);
          if (removedItem?.localPreview) {
            URL.revokeObjectURL(removedItem.previewUrl);
          }
          return { ...draft, items: draft.items.filter((item) => item.id !== itemId) };
        })
        .filter((draft) => draft.items.length > 0);
      const nextSelected = next.find((draft) => draft.id === selectedDraftId) ? selectedDraftId : next[0]?.id ?? "";
      setSelectedDraftId(nextSelected);
      if (!nextSelected) {
        setEditorOpen(false);
      }
      return next;
    });
  }

  function appendToSelectedDraft(files: File[]) {
    if (!selectedDraft || files.length === 0) {
      return;
    }
    const nextItems = files.map((file) => ({
      id: createClientId("media"),
      file,
      fileName: file.name,
      previewUrl: URL.createObjectURL(file),
      capturedAt: toCapturedAt(file),
      mediaType: file.type || "application/octet-stream",
      localPreview: true
    }));
    const hasVideo = selectedDraft.items.some((item) => item.mediaType.startsWith("video/"));
    const incomingVideo = nextItems.some((item) => item.mediaType.startsWith("video/"));
    if (hasVideo || incomingVideo) {
      nextItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setStatus("视频记录暂不支持继续追加，请新建一条记录。");
      return;
    }
    if (selectedDraft.items.length + nextItems.length > 9) {
      nextItems.forEach((item) => URL.revokeObjectURL(item.previewUrl));
      setStatus("一条记录最多 9 张照片。");
      return;
    }
    updateDraft(selectedDraft.id, (draft) => ({
      ...draft,
      items: [...draft.items, ...nextItems]
    }));
    setStatus(null);
  }

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
      setTimeout(() => {
        closeSheet();
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
      closeSheet();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="draftSheetOverlay">
      <section className="draftSheet">
        <header className="draftSheetHeader">
          {editorOpen ? (
            <>
              <button className="draftTopAction" onClick={() => {
                if (isEditMode) {
                  closeSheet();
                  return;
                }
                setEditorOpen(false);
              }} type="button">取消</button>
              <h2>{isEditMode ? "编辑动态" : babyName ? `${babyName}新变化` : "编辑记录"}</h2>
              <button className="draftTopPrimary" onClick={() => {
                if (isEditMode) {
                  void handleUploadAll();
                  return;
                }
                setEditorOpen(false);
              }} type="button">保存</button>
            </>
          ) : (
            <>
              <button className="draftTopAction" onClick={closeSheet} type="button">取消</button>
              <h2>{babyName ? `${babyName}新变化` : "本次上传"}</h2>
              <span className="draftTopSpacer" />
            </>
          )}
        </header>

        <input
          hidden
          accept="image/*,video/*"
          multiple
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length === 0) {
              return;
            }
            const nextDrafts = buildDrafts(files);
            revokeDrafts(drafts);
            setDrafts(nextDrafts);
            setSelectedDraftId(nextDrafts[0]?.id ?? "");
            setEditorOpen(false);
            setStatus(null);
            event.currentTarget.value = "";
          }}
          ref={fileInputRef}
          type="file"
        />
        <input
          hidden
          accept="image/*,video/*"
          multiple
          onChange={(event) => {
            appendFiles(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
          ref={appendInputRef}
          type="file"
        />
        <input
          hidden
          accept="image/*,video/*"
          multiple
          onChange={(event) => {
            appendToSelectedDraft(Array.from(event.target.files ?? []));
            event.currentTarget.value = "";
          }}
          ref={editAppendInputRef}
          type="file"
        />

        {drafts.length === 0 ? (
          <div className="draftEmptyState">
            {isEditMode ? (
              <>
                <p className="helperText">这条动态里已经没有媒体了，可以直接删除，或者重新添加照片后再保存。</p>
                <button onClick={() => editAppendInputRef.current?.click()} type="button">添加照片或视频</button>
              </>
            ) : disabled ? (
              <>
                <p className="helperText">{disabledReason ?? "当前不可上传。"}</p>
                <button className="secondaryButton" onClick={closeSheet} type="button">返回</button>
              </>
            ) : (
              <>
                <p className="helperText">照片会按拍摄日期自动拆成多条记录；同一天最多 9 张照片，视频会单独成一条记录。</p>
                <button onClick={() => fileInputRef.current?.click()} type="button">选择照片或视频</button>
              </>
            )}
          </div>
        ) : (
          <>
            {!editorOpen && !isEditMode ? (
              <div className="draftPage">
                <section className="draftListPage">
                  <div className="draftListCards">
                    {drafts.map((draft) => (
                      <article className="draftListCard panel" key={draft.id}>
                        <div className="draftListCardTop">
                          <strong>{draftDayLabel(draft.manualDate)}</strong>
                          <button
                            className="draftEditInline"
                            onClick={() => {
                              setSelectedDraftId(draft.id);
                              setEditorOpen(true);
                            }}
                            type="button"
                          >
                            编辑
                          </button>
                        </div>
                        <div className="draftListThumbs">
                          {draft.items.slice(0, 4).map((item) => <img alt={item.fileName} key={item.id} src={item.previewUrl} />)}
                        </div>
                        <textarea
                          className="draftListCaption"
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, caption: event.target.value }))}
                          placeholder="添加照片说明..."
                          value={draft.caption}
                        />
                        <p className="helperText">{visibilityLabel(draft.visibility)} · {timeModeLabel(draft.timeMode)}</p>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            ) : selectedDraft ? (
              <div className="draftPage">
                <section className="draftEditorPage panel">
                  <div className="panelStack">
                    <div className="sectionHeading">
                      <div>
                        <p className="eyebrow">记录编辑</p>
                        <h2>{selectedDraft.items.length} 个文件</h2>
                      </div>
                      <span className="draftEditMeta">{selectedDraft.items.length} 张</span>
                    </div>

                    <div className={`draftEditorMedia draftEditorMedia${Math.min(selectedDraft.items.length, 4)}`}>
                      {selectedDraft.items.map((item) => (
                        <div className="draftEditorMediaCard" key={item.id}>
                          <img alt={item.fileName} src={item.previewUrl} />
                          <div className="draftMediaActions">
                            <button className="draftRemoveButton" onClick={() => removeDraftItem(selectedDraft.id, item.id)} type="button">移除</button>
                          </div>
                        </div>
                      ))}
                      <button className="draftAddTile" onClick={() => editAppendInputRef.current?.click()} type="button">添加</button>
                    </div>

                    <textarea className="draftTextarea draftTextareaStandalone" onChange={(event) => updateDraft(selectedDraft.id, (draft) => ({ ...draft, caption: event.target.value }))} placeholder="写点介绍吧" value={selectedDraft.caption} />

                    <div className="draftSettingList">
                      <label className="draftSettingRow">
                        <span>谁可以看</span>
                        <select value={selectedDraft.visibility} onChange={(event) => updateDraft(selectedDraft.id, (draft) => ({ ...draft, visibility: event.target.value as TimelineVisibility }))}>
                          <option value="members">所有家人</option>
                          <option value="managers">仅管理员和所有者</option>
                        </select>
                      </label>

                      <label className="draftSettingRow">
                        <span>记录时间</span>
                        <select value={selectedDraft.timeMode} onChange={(event) => updateDraft(selectedDraft.id, (draft) => ({ ...draft, timeMode: event.target.value as TimelineTimeMode }))}>
                          <option value="captured_at">按拍摄时间</option>
                          <option value="uploaded_at">按当前时间</option>
                          <option value="manual">手动选择日期</option>
                        </select>
                      </label>

                      {selectedDraft.timeMode === "manual" ? (
                        <label className="draftSettingRow">
                          <span>日期</span>
                          <input type="date" value={selectedDraft.manualDate} onChange={(event) => updateDraft(selectedDraft.id, (draft) => ({ ...draft, manualDate: event.target.value }))} />
                        </label>
                      ) : null}
                    </div>

                    {isEditMode ? (
                      <button className="draftDeleteButton" disabled={uploading} onClick={() => void handleDeleteEntry()} type="button">
                        删除这条动态
                      </button>
                    ) : null}
                  </div>
                </section>
              </div>
            ) : null}

            {batchSettingsOpen && !isEditMode ? (
              <div className="draftBatchModal" onClick={() => setBatchSettingsOpen(false)}>
                <section className="draftBatchTools panel" onClick={(event) => event.stopPropagation()}>
                  <div className="panelStack">
                    <div className="sectionHeading">
                      <div>
                        <p className="eyebrow">批量设置</p>
                        <h2>统一设置这批记录</h2>
                      </div>
                      <button className="secondaryButton" onClick={() => setBatchSettingsOpen(false)} type="button">收起</button>
                    </div>
                    <div className="formGrid">
                      <label>
                        可见范围
                        <select value={batchVisibility} onChange={(event) => setBatchVisibility(event.target.value as TimelineVisibility)}>
                          <option value="members">相册成员可见</option>
                          <option value="managers">仅管理员和所有者</option>
                        </select>
                      </label>
                      <label>
                        时间策略
                        <select value={batchTimeMode} onChange={(event) => setBatchTimeMode(event.target.value as TimelineTimeMode)}>
                          <option value="captured_at">按拍摄时间</option>
                          <option value="uploaded_at">按当前时间</option>
                          <option value="manual">手动选择日期</option>
                        </select>
                      </label>
                      {batchTimeMode === "manual" ? (
                        <label>
                          日期
                          <input type="date" value={batchManualDate} onChange={(event) => setBatchManualDate(event.target.value)} />
                        </label>
                      ) : null}
                    </div>
                    <button
                      onClick={() => {
                        setDrafts((current) => current.map((draft) => ({
                          ...draft,
                          visibility: batchVisibility,
                          timeMode: batchTimeMode,
                          manualDate: batchTimeMode === "manual" && batchManualDate ? batchManualDate : draft.manualDate
                        })));
                        setBatchSettingsOpen(false);
                      }}
                      type="button"
                    >
                      应用到全部记录
                    </button>
                  </div>
                </section>
              </div>
            ) : null}

            {!isEditMode ? (
              <footer className="draftFloatingBar">
                <button className="secondaryButton" onClick={() => setBatchSettingsOpen(true)} type="button">批量设置</button>
                <button disabled={uploading || disabled} onClick={() => void handleUploadAll()} type="button">{uploading ? "保存中..." : "保存"}</button>
              </footer>
            ) : null}
            {status ? <p className="statusNote">{status}</p> : null}
          </>
        )}
        {uploadProgress ? (
          <div className="draftUploadDialogOverlay">
            <div aria-live="polite" className="draftUploadDialog" role="status">
              <p className="eyebrow">上传</p>
              <h3>{uploadProgress.title}</h3>
              <p className="draftUploadDialogDetail">{uploadProgress.detail}</p>
              {uploadProgress.currentFileName ? <p className="draftUploadDialogFile">{uploadProgress.currentFileName}</p> : null}
              <div className="draftUploadMeter">
                <span className="draftUploadMeterFill" style={{ width: `${progressPercent(uploadProgress)}%` }} />
              </div>
              <div className="draftUploadStats">
                <span>{progressPercent(uploadProgress)}%</span>
                <span>{formatBytes(uploadProgress.transferredBytes)} / {formatBytes(uploadProgress.totalBytes || uploadProgress.transferredBytes)}</span>
                <span>{formatTransferRate(uploadProgress.bytesPerSecond)}</span>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
