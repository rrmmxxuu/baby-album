interface DraftSheetHeaderProps {
  isEditMode: boolean;
  currentScene: "list" | "detail";
  babyName?: string;
  onClose: () => void;
  onBackToList: () => void;
  onSaveOrDone: () => void;
}

export function DraftSheetHeader({ isEditMode, currentScene, babyName, onClose, onBackToList, onSaveOrDone }: DraftSheetHeaderProps) {
  return (
    <header className="draftSheetHeader">
      {currentScene === "detail" ? (
        <>
          <button className="draftTopAction" onClick={isEditMode ? onClose : onBackToList} type="button">取消</button>
          <h2>{isEditMode ? "编辑动态" : babyName ? `${babyName}新变化` : "编辑记录"}</h2>
          <button className="draftTopPrimary" onClick={onSaveOrDone} type="button">{isEditMode ? "保存" : "完成"}</button>
        </>
      ) : (
        <>
          <button className="draftTopAction" onClick={onClose} type="button">取消</button>
          <h2>{babyName ? `${babyName}新变化` : "本次上传"}</h2>
          <span className="draftTopSpacer" />
        </>
      )}
    </header>
  );
}
