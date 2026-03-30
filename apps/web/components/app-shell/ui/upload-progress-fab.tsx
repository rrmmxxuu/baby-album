"use client";

import { progressPercent } from "../../upload-draft-sheet/model/progress";
import type { BackgroundUploadState } from "../../upload-draft-sheet/model/types";

interface UploadProgressFabProps {
  state: BackgroundUploadState;
  onClick: () => void;
}

export function UploadProgressFab({ state, onClick }: UploadProgressFabProps) {
  if (state.phase !== "uploading" && state.phase !== "success") {
    return null;
  }

  const isSuccess = state.phase === "success";
  const percent = state.progress ? progressPercent(state.progress) : 0;
  const progress = isSuccess ? 100 : Math.min(Math.max(percent, 0), 100);
  const strokeWidth = 4;
  const ringSize = 46;
  const radius = (ringSize - strokeWidth) / 2;
  const indicatorClassName = [
    "uploadProgressFabIndicator",
    !isSuccess && percent <= 0 ? "uploadProgressFabIndicatorHidden" : "",
    !isSuccess && percent > 0 ? "uploadProgressFabIndicatorAnimated" : ""
  ].filter(Boolean).join(" ");

  return (
    <button
      aria-label={isSuccess ? "上传已完成" : `上传进度 ${percent}%`}
      className={`floatingAddButton uploadProgressFab${isSuccess ? " uploadProgressFabSuccess" : ""}`}
      onClick={onClick}
      type="button"
    >
      <svg aria-hidden="true" className="uploadProgressFabRing" height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`} width={ringSize}>
        <circle className="uploadProgressFabTrack" cx={ringSize / 2} cy={ringSize / 2} pathLength={100} r={radius} strokeWidth={strokeWidth} />
        <circle
          className={indicatorClassName}
          cx={ringSize / 2}
          cy={ringSize / 2}
          pathLength={100}
          r={radius}
          strokeDasharray={`${progress} 100`}
          strokeWidth={strokeWidth}
        />
      </svg>
      <span className="uploadProgressFabLabel">{isSuccess ? "✓" : percent}</span>
    </button>
  );
}
