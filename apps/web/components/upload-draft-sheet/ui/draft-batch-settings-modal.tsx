import type { UploadDraftState } from "../hooks/use-upload-draft-state";
import { SectionHeading } from "../../ui/section-heading";
import { DraftPublishSettings } from "./draft-publish-settings";

interface DraftBatchSettingsModalProps {
  draftState: UploadDraftState;
}

export function DraftBatchSettingsModal({ draftState }: DraftBatchSettingsModalProps) {
  if (draftState.activeModal !== "batchSettings" || draftState.isEditMode) {
    return null;
  }

  return (
    <div className="draftBatchModal" onClick={() => draftState.setActiveModal(null)}>
      <section className="draftBatchTools panel" onClick={(event) => event.stopPropagation()}>
        <div className="panelStack">
          <SectionHeading eyebrow="批量设置" title="统一设置这批记录" />
          <DraftPublishSettings
            className="formGrid"
            manualDate={draftState.batchManualDate}
            onManualDateChange={draftState.setBatchManualDate}
            onTimeModeChange={draftState.setBatchTimeMode}
            onVisibilityChange={draftState.setBatchVisibility}
            timeMode={draftState.batchTimeMode}
            visibility={draftState.batchVisibility}
          />
          <div className="draftBatchActions">
            <button className="secondaryButton" onClick={() => draftState.setActiveModal(null)} type="button">返回</button>
            <button onClick={() => draftState.applyBatchSettings()} type="button">应用到全部记录</button>
          </div>
        </div>
      </section>
    </div>
  );
}
