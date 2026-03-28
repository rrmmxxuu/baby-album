interface DraftFloatingBarProps {
  disabled?: boolean;
  uploading: boolean;
  onOpenBatchSettings: () => void;
  onSave: () => void | Promise<void>;
}

export function DraftFloatingBar({ disabled, uploading, onOpenBatchSettings, onSave }: DraftFloatingBarProps) {
  return (
    <footer className="draftFloatingBar">
      <button className="secondaryButton" onClick={onOpenBatchSettings} type="button">批量设置</button>
      <button disabled={uploading || disabled} onClick={() => void onSave()} type="button">{uploading ? "保存中..." : "保存"}</button>
    </footer>
  );
}
