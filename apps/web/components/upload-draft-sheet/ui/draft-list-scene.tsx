import type { UploadDraftState } from "../hooks/use-upload-draft-state";
import { draftDayLabel, timeModeLabel, visibilityLabel } from "../model/drafts";
import { DraftCaptionField } from "./draft-caption-field";

interface DraftListSceneProps {
  draftState: UploadDraftState;
}

export function DraftListScene({ draftState }: DraftListSceneProps) {
  return (
    <div className="draftPage draftScene draftSceneList">
      <section className="draftListPage">
        <div className="draftListCards">
          {draftState.drafts.map((draft) => (
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
                {draft.items.slice(0, 4).map((item) => <img alt={item.fileName} key={item.id} src={item.previewUrl} />)}
              </div>
              <DraftCaptionField
                className="draftListCaption"
                onChange={(caption) => draftState.updateDraft(draft.id, (current) => ({ ...current, caption }))}
                placeholder="添加照片说明..."
                value={draft.caption}
              />
              <p className="helperText">{visibilityLabel(draft.visibility)} · {timeModeLabel(draft.timeMode)}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
