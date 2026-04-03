"use client";

import { useState } from "react";
import { deleteTimelineEntry } from "../../../lib/api";
import type { TimelineEntry } from "../../../lib/types";
import type { BackgroundUploadJobDraft, UploadDraft } from "../model/types";
import type { BackgroundUploadController } from "./use-background-upload";

interface UseUploadSubmitOptions {
  albumId: string;
  disabled?: boolean;
  disabledReason?: string;
  drafts: UploadDraft[];
  selectedDraft: UploadDraft | null;
  editingEntry?: TimelineEntry | null;
  originalMediaIds: Set<string>;
  backgroundUpload: BackgroundUploadController;
  onUploaded?: () => void;
  onDeleted?: () => void;
  onClose: () => void;
  setStatus: (value: string | null) => void;
}

function snapshotDraft(draft: UploadDraft): BackgroundUploadJobDraft {
  return {
    id: draft.id,
    caption: draft.caption,
    visibility: draft.visibility,
    timeMode: draft.timeMode,
    manualDate: draft.manualDate,
    items: draft.items.map((item) => ({
      id: item.id,
      file: item.file,
      fileName: item.fileName,
      capturedAt: item.capturedAt,
      mediaType: item.mediaType,
      existingMediaId: item.existingMediaId
    }))
  };
}

export function useUploadSubmit({ albumId, disabled, disabledReason, drafts, selectedDraft, editingEntry, originalMediaIds, backgroundUpload, onUploaded, onDeleted, onClose, setStatus }: UseUploadSubmitOptions) {
  const isEditMode = Boolean(editingEntry);
  const [deleting, setDeleting] = useState(false);
  const uploading = backgroundUpload.state.phase === "uploading" || deleting;

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
    if (backgroundUpload.hasTask) {
      setStatus("当前已有上传进行中，请完成后再试。");
      return;
    }
    setStatus(null);
    if (isEditMode) {
      if (!editingEntry || !selectedDraft) {
        setStatus("缺少需要保存的动态。");
        return;
      }
      const started = backgroundUpload.startUpload({
        albumId,
        mode: "edit",
        drafts: [snapshotDraft(selectedDraft)],
        editingEntryId: editingEntry.id,
        originalMediaIds: Array.from(originalMediaIds),
        onUploaded
      });
      if (started) {
        onClose();
      }
      return;
    }
    const started = backgroundUpload.startUpload({
      albumId,
      mode: "create",
      drafts: drafts.map(snapshotDraft),
      originalMediaIds: [],
      onUploaded
    });
    if (started) {
      onClose();
    }
  }

  async function handleDeleteEntry() {
    if (!editingEntry) {
      return;
    }
    if (!window.confirm("确认删除这条动态吗？删除后不能恢复。")) {
      return;
    }
    setDeleting(true);
    setStatus("正在删除这条动态");
    try {
      await deleteTimelineEntry(albumId, editingEntry.id);
      onDeleted?.();
      onClose();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setDeleting(false);
    }
  }

  return {
    uploading,
    handleUploadAll,
    handleDeleteEntry
  };
}

export type UploadSubmitState = ReturnType<typeof useUploadSubmit>;
