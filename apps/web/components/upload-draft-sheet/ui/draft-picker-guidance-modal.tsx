interface DraftPickerGuidanceModalProps {
  open: boolean;
  onCancel: () => void;
  onContinue: () => void;
}

export function DraftPickerGuidanceModal({ open, onCancel, onContinue }: DraftPickerGuidanceModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="draftBatchModal" onClick={onCancel}>
      <section className="draftBatchTools panel" onClick={(event) => event.stopPropagation()}>
        <div className="panelStack">
          <p className="helperText">iPhone 上一次选择很多 HEIC 或 Live Photo 时，系统相册可能需要先准备文件，再把它们交给网页。</p>
          <p className="helperText">建议每次先选 20 到 30 张，回到草稿页后再点右上角继续追加，整体会更稳定。</p>
          <div className="draftBatchActions">
            <button className="secondaryButton" onClick={onCancel} type="button">稍后再选</button>
            <button onClick={onContinue} type="button">继续选择</button>
          </div>
        </div>
      </section>
    </div>
  );
}
