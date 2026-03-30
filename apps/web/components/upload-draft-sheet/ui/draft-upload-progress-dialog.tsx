import type { BackgroundUploadState } from "../model/types";
import { formatBytes, formatTransferRate, progressPercent } from "../model/progress";

interface DraftUploadProgressDialogProps {
  state: BackgroundUploadState;
  onCloseError: () => void;
  onMinimize: () => void;
}

export function DraftUploadProgressDialog({ state, onCloseError, onMinimize }: DraftUploadProgressDialogProps) {
  if (!state.progress || state.surface !== "dialog" || (state.phase !== "uploading" && state.phase !== "error")) {
    return null;
  }

  const isError = state.phase === "error";

  return (
    <div className="draftUploadDialogOverlay">
      <div aria-live="polite" className="draftUploadDialog" role={isError ? "alert" : "status"}>
        <div className="draftUploadDialogHeader">
          <div className="draftUploadDialogCopy">
            <p className="eyebrow">上传</p>
            <h3>{state.progress.title}</h3>
          </div>
          <button className="draftUploadDialogAction" onClick={isError ? onCloseError : onMinimize} type="button">
            {isError ? "关闭" : "最小化"}
          </button>
        </div>
        <p className="draftUploadDialogDetail">{state.progress.detail}</p>
        {state.progress.currentFileName ? <p className="draftUploadDialogFile">{state.progress.currentFileName}</p> : null}
        <div className="draftUploadMeter">
          <span className="draftUploadMeterFill" style={{ width: `${progressPercent(state.progress)}%` }} />
        </div>
        <div className="draftUploadStats">
          <span>{progressPercent(state.progress)}%</span>
          <span>{formatBytes(state.progress.transferredBytes)} / {formatBytes(state.progress.totalBytes || state.progress.transferredBytes)}</span>
          <span>{formatTransferRate(state.progress.bytesPerSecond)}</span>
        </div>
      </div>
    </div>
  );
}
