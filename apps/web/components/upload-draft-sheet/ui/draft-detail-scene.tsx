import type { UploadDraftState } from "../hooks/use-upload-draft-state";
import type { DraftDuplicateCheckState } from "../hooks/use-draft-duplicate-check";
import type { UploadSubmitState } from "../hooks/use-upload-submit";
import { SectionHeading } from "../../ui/section-heading";
import { DraftCaptionField } from "./draft-caption-field";
import { DraftMediaGrid } from "./draft-media-grid";
import { DraftPublishSettings } from "./draft-publish-settings";

interface DraftDetailSceneProps {
  draftState: UploadDraftState;
  duplicateState: DraftDuplicateCheckState;
  submitState: UploadSubmitState;
  onAppendFiles: () => void;
}

export function DraftDetailScene({ draftState, duplicateState, submitState, onAppendFiles }: DraftDetailSceneProps) {
  const draft = draftState.selectedDraft;

  if (!draft) {
    return null;
  }

  return (
    <div className="draftPage draftScene draftSceneDetail">
      <section className="draftEditorPage panel">
        <div className="panelStack">
          <SectionHeading eyebrow="记录编辑" title={`${draft.items.length} 个文件`} aside={<span className="draftEditMeta">{draft.items.length} 张</span>} />

          {duplicateState.checking ? <p className="helperText draftDuplicateChecking">正在检查这些照片是否已上传过...</p> : null}

          <DraftMediaGrid draftId={draft.id} duplicateItemStates={duplicateState.itemStates} items={draft.items} onAppendFiles={onAppendFiles} onRemoveItem={draftState.removeDraftItem} />

          <DraftCaptionField
            className="draftTextarea draftTextareaStandalone"
            onChange={(caption) => draftState.updateDraft(draft.id, (current) => ({ ...current, caption }))}
            placeholder="写点介绍吧"
            value={draft.caption}
          />

          <DraftPublishSettings
            className="draftSettingList"
            fieldClassName="draftSettingRow"
            manualDate={draft.manualDate}
            onManualDateChange={(manualDate) => draftState.updateDraft(draft.id, (current) => ({ ...current, manualDate }))}
            onTimeModeChange={(timeMode) => draftState.updateDraft(draft.id, (current) => ({ ...current, timeMode }))}
            onVisibilityChange={(visibility) => draftState.updateDraft(draft.id, (current) => ({ ...current, visibility }))}
            timeMode={draft.timeMode}
            visibility={draft.visibility}
          />

          {draftState.isEditMode ? (
            <button className="draftDeleteButton" disabled={submitState.uploading} onClick={() => void submitState.handleDeleteEntry()} type="button">
              删除这条动态
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
