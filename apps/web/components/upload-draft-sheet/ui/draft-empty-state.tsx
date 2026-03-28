interface DraftEmptyStateProps {
  isEditMode: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onClose: () => void;
  onPickFiles: () => void;
}

export function DraftEmptyState({ isEditMode, disabled, disabledReason, onClose, onPickFiles }: DraftEmptyStateProps) {
  return (
    <div className="draftEmptyState">
      {isEditMode ? (
        <>
          <p className="helperText">这条动态里已经没有媒体了，可以直接删除，或者重新添加照片后再保存。</p>
          <button className="draftChooserButton" onClick={onPickFiles} type="button">添加照片或视频</button>
        </>
      ) : disabled ? (
        <>
          <p className="helperText">{disabledReason ?? "当前不可上传。"}</p>
          <button className="secondaryButton" onClick={onClose} type="button">返回</button>
        </>
      ) : (
        <>
          <p className="helperText">照片会按拍摄日期自动拆成多条记录；同一天最多 9 张照片，视频会单独成一条记录。</p>
          <button className="draftChooserButton" onClick={onPickFiles} type="button">选择照片或视频</button>
        </>
      )}
    </div>
  );
}
