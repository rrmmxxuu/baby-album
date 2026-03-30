"use client";

import { useRef } from "react";
import type { TimelineEntry } from "../lib/types";
import { useDraftDuplicateCheck } from "./upload-draft-sheet/hooks/use-draft-duplicate-check";
import { useUploadDraftState } from "./upload-draft-sheet/hooks/use-upload-draft-state";
import { useUploadSubmit } from "./upload-draft-sheet/hooks/use-upload-submit";
import { DraftBatchSettingsModal } from "./upload-draft-sheet/ui/draft-batch-settings-modal";
import { DraftDetailScene } from "./upload-draft-sheet/ui/draft-detail-scene";
import { DraftEmptyState } from "./upload-draft-sheet/ui/draft-empty-state";
import { DraftFloatingBar } from "./upload-draft-sheet/ui/draft-floating-bar";
import { DraftListScene } from "./upload-draft-sheet/ui/draft-list-scene";
import { DraftSheetHeader } from "./upload-draft-sheet/ui/draft-sheet-header";
import { DraftUploadProgressDialog } from "./upload-draft-sheet/ui/draft-upload-progress-dialog";
import { HiddenFileInput } from "./ui/hidden-file-input";

interface UploadDraftSheetProps {
  albumId: string;
  babyName?: string;
  open: boolean;
  disabled?: boolean;
  disabledReason?: string;
  editingEntry?: TimelineEntry | null;
  onClose: () => void;
  onUploaded?: () => void;
  onDeleted?: () => void;
}

export function UploadDraftSheet({ albumId, babyName, open, disabled, disabledReason, editingEntry, onClose, onUploaded, onDeleted }: UploadDraftSheetProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const appendInputRef = useRef<HTMLInputElement | null>(null);
  const editAppendInputRef = useRef<HTMLInputElement | null>(null);
  const draftState = useUploadDraftState({ albumId, open, editingEntry });
  const duplicateState = useDraftDuplicateCheck({
    albumId,
    open,
    drafts: draftState.drafts
  });
  const submitState = useUploadSubmit({
    albumId,
    open,
    disabled,
    disabledReason,
    drafts: draftState.drafts,
    selectedDraft: draftState.selectedDraft,
    editingEntry,
    originalMediaIds: draftState.originalMediaIds,
    onUploaded,
    onDeleted,
    onClose,
    setStatus: draftState.setStatus
  });

  if (!draftState.shouldRender) {
    return null;
  }

  return (
    <div className={`draftSheetOverlay${draftState.visible ? " draftSheetOverlayOpen" : ""}${open ? "" : " draftSheetOverlayClosing"}`}>
      <section className={`draftSheet${draftState.visible ? " draftSheetOpen" : ""}${open ? "" : " draftSheetClosing"}${!draftState.isEditMode && draftState.currentScene === "list" ? " draftSheetWithFloatingBar" : ""}`}>
        <DraftSheetHeader
          babyName={babyName}
          currentScene={draftState.currentScene}
          isEditMode={draftState.isEditMode}
          onBackToList={() => draftState.setScene("list")}
          onClose={onClose}
          onSaveOrDone={() => {
            if (draftState.isEditMode) {
              void submitState.handleUploadAll();
              return;
            }
            draftState.setScene("list");
          }}
        />

        <HiddenFileInput inputRef={fileInputRef} onFilesSelected={draftState.replaceWithFiles} />
        <HiddenFileInput inputRef={appendInputRef} onFilesSelected={draftState.appendFiles} />
        <HiddenFileInput inputRef={editAppendInputRef} onFilesSelected={draftState.appendToSelectedDraft} />

        {draftState.drafts.length === 0 ? (
          <DraftEmptyState
            disabled={disabled}
            disabledReason={disabledReason}
            isEditMode={draftState.isEditMode}
            onClose={onClose}
            onPickFiles={() => (draftState.isEditMode ? editAppendInputRef.current?.click() : fileInputRef.current?.click())}
          />
        ) : (
          <>
            {draftState.currentScene === "list" && !draftState.isEditMode ? <DraftListScene draftState={draftState} duplicateState={duplicateState} /> : null}
            {draftState.currentScene === "detail" || draftState.isEditMode ? <DraftDetailScene draftState={draftState} duplicateState={duplicateState} onAppendFiles={() => editAppendInputRef.current?.click()} submitState={submitState} /> : null}
            {draftState.status ? <p className="statusNote">{draftState.status}</p> : null}
          </>
        )}
      </section>
      <DraftBatchSettingsModal draftState={draftState} />
      <DraftUploadProgressDialog submitState={submitState} />
      {!draftState.isEditMode && draftState.currentScene === "list" ? (
        <DraftFloatingBar disabled={disabled} onOpenBatchSettings={() => draftState.setActiveModal("batchSettings")} onSave={submitState.handleUploadAll} uploading={submitState.uploading} />
      ) : null}
    </div>
  );
}
