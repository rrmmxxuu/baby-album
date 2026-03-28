import type { UploadSubmitState } from "../hooks/use-upload-submit";
import { formatBytes, formatTransferRate, progressPercent } from "../model/progress";

interface DraftUploadProgressDialogProps {
  submitState: UploadSubmitState;
}

export function DraftUploadProgressDialog({ submitState }: DraftUploadProgressDialogProps) {
  if (!submitState.uploadProgress) {
    return null;
  }

  return (
    <div className="draftUploadDialogOverlay">
      <div aria-live="polite" className="draftUploadDialog" role="status">
        <p className="eyebrow">上传</p>
        <h3>{submitState.uploadProgress.title}</h3>
        <p className="draftUploadDialogDetail">{submitState.uploadProgress.detail}</p>
        {submitState.uploadProgress.currentFileName ? <p className="draftUploadDialogFile">{submitState.uploadProgress.currentFileName}</p> : null}
        <div className="draftUploadMeter">
          <span className="draftUploadMeterFill" style={{ width: `${progressPercent(submitState.uploadProgress)}%` }} />
        </div>
        <div className="draftUploadStats">
          <span>{progressPercent(submitState.uploadProgress)}%</span>
          <span>{formatBytes(submitState.uploadProgress.transferredBytes)} / {formatBytes(submitState.uploadProgress.totalBytes || submitState.uploadProgress.transferredBytes)}</span>
          <span>{formatTransferRate(submitState.uploadProgress.bytesPerSecond)}</span>
        </div>
      </div>
    </div>
  );
}
