import type { BackgroundUploadState } from "../model/types";
import { formatBytes, formatTransferRate, progressPercent } from "../model/progress";

interface DraftUploadProgressDialogProps {
  state: BackgroundUploadState;
  onCloseError: () => void;
  onMinimize: () => void;
}

export function DraftUploadProgressDialog({ state, onCloseError, onMinimize }: DraftUploadProgressDialogProps) {
  if (
    !state.progress
    || state.surface !== "dialog"
    || (state.phase !== "uploading" && state.phase !== "partial_success" && state.phase !== "error")
  ) {
    return null;
  }

  const isError = state.phase === "error";
  const isPartialSuccess = state.phase === "partial_success";
  const failureList = isError || isPartialSuccess ? state.failedItems : [];

  return (
    <div className="draftUploadDialogOverlay">
      <div aria-live="polite" className="draftUploadDialog" role={isError || isPartialSuccess ? "alert" : "status"}>
        <div className="draftUploadDialogHeader">
          <div className="draftUploadDialogCopy">
            <p className="eyebrow">上传</p>
            <h3>{state.progress.title}</h3>
          </div>
          <button className="draftUploadDialogAction" onClick={isError || isPartialSuccess ? onCloseError : onMinimize} type="button">
            {isError || isPartialSuccess ? "关闭" : "最小化"}
          </button>
        </div>
        <p className="draftUploadDialogDetail">{state.progress.detail}</p>
        {state.progress.currentFileName ? <p className="draftUploadDialogFile">{state.progress.currentFileName}</p> : null}
        {failureList.length > 0 ? (
          <div className="draftUploadFailures" aria-label="未上传文件">
            {failureList.map((failure) => (
              <div className="draftUploadFailureItem" key={`${failure.draftId}:${failure.itemId}`}>
                <span className="draftUploadFailureName">{failure.fileName}</span>
                <span className="draftUploadFailureMessage">{failure.message}</span>
              </div>
            ))}
          </div>
        ) : null}
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
