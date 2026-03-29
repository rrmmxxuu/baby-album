import type { UploadDraftState } from "../hooks/use-upload-draft-state";
import type { DraftDuplicateCheckState } from "../hooks/use-draft-duplicate-check";
import { draftDayLabel, timeModeLabel, visibilityLabel } from "../model/drafts";
import { DraftCaptionField } from "./draft-caption-field";

interface DraftListSceneProps {
  draftState: UploadDraftState;
  duplicateState: DraftDuplicateCheckState;
}

export function DraftListScene({ draftState, duplicateState }: DraftListSceneProps) {
  return (
    <div className="draftPage draftScene draftSceneList">
      <section className="draftListPage">
        {duplicateState.checking ? <p className="helperText draftDuplicateChecking">正在检查这些照片是否已上传过...</p> : null}
        <div className="draftListCards">
          {draftState.drafts.map((draft) => {
            return (
              <article className="draftListCard panel" key={draft.id}>
                <div className="draftListCardTop">
                  <strong>{draftDayLabel(draft.manualDate)}</strong>
                  <button
                    className="draftEditInline"
                    onClick={() => {
                      draftState.openDraftDetail(draft.id);
                    }}
                    type="button"
                  >
                    编辑
                  </button>
                </div>
                <div className="draftListThumbs draftPreviewSurface">
                  {draft.items.slice(0, 4).map((item) => (
                    <div className="draftListThumbCard" key={item.id}>
                      <img alt={item.fileName} src={item.previewUrl} />
                      {duplicateState.itemStates[item.id]?.status === "duplicate" ? <span className="draftDuplicateBadge">重复</span> : null}
                    </div>
                  ))}
                </div>
                <DraftCaptionField
                  className="draftListCaption"
                  onChange={(caption) => draftState.updateDraft(draft.id, (current) => ({ ...current, caption }))}
                  placeholder="添加照片说明..."
                  value={draft.caption}
                />
                <p className="helperText">{visibilityLabel(draft.visibility)} · {timeModeLabel(draft.timeMode)}</p>
              </article>
            );
          })}
          <div aria-hidden="true" className="draftListBottomSpacer" />
        </div>
      </section>
    </div>
  );
}
