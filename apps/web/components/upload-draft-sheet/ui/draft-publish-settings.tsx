import type { TimelineTimeMode, TimelineVisibility } from "../../../lib/types";

interface DraftPublishSettingsProps {
  className: string;
  fieldClassName?: string;
  manualDate: string;
  timeMode: TimelineTimeMode;
  visibility: TimelineVisibility;
  onManualDateChange: (value: string) => void;
  onTimeModeChange: (value: TimelineTimeMode) => void;
  onVisibilityChange: (value: TimelineVisibility) => void;
}

export function DraftPublishSettings({ className, fieldClassName, manualDate, timeMode, visibility, onManualDateChange, onTimeModeChange, onVisibilityChange }: DraftPublishSettingsProps) {
  return (
    <div className={className}>
      <label className={fieldClassName}>
        <span>谁可以看</span>
        <select value={visibility} onChange={(event) => onVisibilityChange(event.target.value as TimelineVisibility)}>
          <option value="members">所有家人</option>
          <option value="managers">仅管理员和创建者</option>
        </select>
      </label>

      <label className={fieldClassName}>
        <span>记录时间</span>
        <select value={timeMode} onChange={(event) => onTimeModeChange(event.target.value as TimelineTimeMode)}>
          <option value="captured_at">按拍摄时间</option>
          <option value="uploaded_at">按当前时间</option>
          <option value="manual">手动选择日期</option>
        </select>
      </label>

      {timeMode === "manual" ? (
        <label className={fieldClassName}>
          <span>日期</span>
          <input type="date" value={manualDate} onChange={(event) => onManualDateChange(event.target.value)} />
        </label>
      ) : null}
    </div>
  );
}
