"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TimelineEntry, TimelineTimeMode, TimelineVisibility } from "../../../lib/types";
import { buildDraftFromEntry, buildDrafts, mergeDrafts, revokeDrafts, toCapturedAt, createClientId } from "../model/drafts";
import { revokeLocalMediaResourcesForFile } from "../model/local-media";
import type { DraftModal, DraftScene, UploadDraft } from "../model/types";

const SHEET_EXIT_MS = 260;

interface UseUploadDraftStateOptions {
  albumId: string;
  open: boolean;
  editingEntry?: TimelineEntry | null;
}

export function useUploadDraftState({ albumId, open, editingEntry }: UseUploadDraftStateOptions) {
  const draftsRef = useRef<UploadDraft[]>([]);
  const [drafts, setDrafts] = useState<UploadDraft[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [scene, setScene] = useState<DraftScene>("list");
  const [activeModal, setActiveModal] = useState<DraftModal>(null);
  const [batchVisibility, setBatchVisibility] = useState<TimelineVisibility>("members");
  const [batchTimeMode, setBatchTimeMode] = useState<TimelineTimeMode>("captured_at");
  const [batchManualDate, setBatchManualDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [shouldRender, setShouldRender] = useState(open);
  const [visible, setVisible] = useState(false);

  const isEditMode = Boolean(editingEntry);
  const currentScene: DraftScene = isEditMode ? "detail" : scene;
  const selectedDraft = drafts.find((item) => item.id === selectedDraftId) ?? drafts[0] ?? null;
  const totalFiles = useMemo(() => drafts.reduce((sum, draft) => sum + draft.items.length, 0), [drafts]);
  const originalMediaIds = useMemo(() => new Set(editingEntry?.items.map((item) => item.id) ?? []), [editingEntry]);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (editingEntry) {
      const initialDraft = buildDraftFromEntry(editingEntry, albumId);
      setDrafts([initialDraft]);
      setSelectedDraftId(initialDraft.id);
      setScene("detail");
      setActiveModal(null);
      setStatus(null);
      return;
    }
    setDrafts([]);
    setSelectedDraftId("");
    setScene("list");
    setActiveModal(null);
    setStatus(null);
  }, [albumId, editingEntry, open]);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      const frame = window.requestAnimationFrame(() => setVisible(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setVisible(false);
    const timer = window.setTimeout(() => {
      revokeDrafts(draftsRef.current);
      setDrafts([]);
      setSelectedDraftId("");
      setScene("list");
      setActiveModal(null);
      setStatus(null);
      setShouldRender(false);
    }, SHEET_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (drafts.length > 0 && !selectedDraftId) {
      setSelectedDraftId(drafts[0].id);
    }
  }, [drafts, open, selectedDraftId]);

  function updateDraft(draftId: string, recipe: (draft: UploadDraft) => UploadDraft) {
    setDrafts((current) => current.map((draft) => draft.id === draftId ? recipe(draft) : draft));
  }

  function openDraftDetail(draftId: string) {
    setSelectedDraftId(draftId);
    setScene("detail");
  }

  function replaceWithFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }
    const nextDrafts = buildDrafts(files);
    revokeDrafts(draftsRef.current);
    setDrafts(nextDrafts);
    setSelectedDraftId(nextDrafts[0]?.id ?? "");
    setScene("list");
    setActiveModal(null);
    setStatus(null);
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
          if (removedItem?.file) {
            revokeLocalMediaResourcesForFile(removedItem.file);
          }
          return { ...draft, items: draft.items.filter((item) => item.id !== itemId) };
        })
        .filter((draft) => draft.items.length > 0);
      const removedSelectedDraft = draftId === selectedDraftId && !next.some((draft) => draft.id === selectedDraftId);
      const nextSelected = next.find((draft) => draft.id === selectedDraftId) ? selectedDraftId : next[0]?.id ?? "";
      setSelectedDraftId(nextSelected);
      if (removedSelectedDraft && !isEditMode) {
        setScene("list");
      }
      if (!nextSelected) {
        setScene("list");
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
      capturedAt: toCapturedAt(file),
      mediaType: file.type || "application/octet-stream",
      localPreview: true
    }));
    const hasVideo = selectedDraft.items.some((item) => item.mediaType.startsWith("video/"));
    const incomingVideo = nextItems.some((item) => item.mediaType.startsWith("video/"));
    if (hasVideo || incomingVideo) {
      setStatus("视频记录暂不支持继续追加，请新建一条记录。");
      return;
    }
    if (selectedDraft.items.length + nextItems.length > 9) {
      setStatus("一条记录最多 9 张照片。");
      return;
    }
    updateDraft(selectedDraft.id, (draft) => ({
      ...draft,
      items: [...draft.items, ...nextItems]
    }));
    setStatus(null);
  }

  function applyBatchSettings() {
    setDrafts((current) => current.map((draft) => ({
      ...draft,
      visibility: batchVisibility,
      timeMode: batchTimeMode,
      manualDate: batchTimeMode === "manual" && batchManualDate ? batchManualDate : draft.manualDate
    })));
    setActiveModal(null);
  }

  return {
    drafts,
    selectedDraft,
    totalFiles,
    originalMediaIds,
    isEditMode,
    currentScene,
    scene,
    setScene,
    activeModal,
    setActiveModal,
    batchVisibility,
    setBatchVisibility,
    batchTimeMode,
    setBatchTimeMode,
    batchManualDate,
    setBatchManualDate,
    status,
    setStatus,
    shouldRender,
    visible,
    updateDraft,
    openDraftDetail,
    replaceWithFiles,
    appendFiles,
    removeDraftItem,
    appendToSelectedDraft,
    applyBatchSettings
  };
}

export type UploadDraftState = ReturnType<typeof useUploadDraftState>;
