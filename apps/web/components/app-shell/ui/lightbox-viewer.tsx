"use client";

import { useEffect, useState } from "react";
import { getOriginalUrl, getPreviewUrl } from "../../../lib/api";
import { useLightboxOriginalImage } from "../hooks/use-lightbox-original-image";
import { formatDateTime, formatRelativeUploadTime } from "../model/format";
import type { LightboxState } from "../model/types";

interface LightboxViewerProps {
  lightbox: LightboxState;
  closing: boolean;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
}

function LightboxDownloadProgress({ progress }: { progress: number | null }) {
  const size = 28;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = typeof progress === "number" ? Math.max(0, Math.min(100, Math.round(progress * 100))) : undefined;
  const dashOffset = percent === undefined ? circumference * 0.28 : circumference - (circumference * percent) / 100;
  const indicatorStyle = percent === undefined
    ? {
        strokeDasharray: `${circumference * 0.36} ${circumference}`,
        strokeDashoffset: `${circumference * 0.08}`
      }
    : {
        strokeDasharray: `${circumference}`,
        strokeDashoffset: `${dashOffset}`
      };

  return (
    <div
      aria-label="原图下载进度"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      aria-valuetext={percent === undefined ? "正在下载原图" : `原图已下载 ${percent}%`}
      className={`lightboxDownloadBadge${percent === undefined ? " lightboxDownloadBadgeIndeterminate" : ""}`}
      role="progressbar"
    >
      <svg aria-hidden="true" className="lightboxDownloadRing" height={size} viewBox={`0 0 ${size} ${size}`} width={size}>
        <circle className="lightboxDownloadTrack" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
        <circle className="lightboxDownloadIndicator" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} style={indicatorStyle} />
      </svg>
    </div>
  );
}

export function LightboxViewer({ lightbox, closing, onClose, onNavigate }: LightboxViewerProps) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [originalVisible, setOriginalVisible] = useState(false);
  const currentItem = lightbox.batch.items[lightbox.index];
  const isVideo = currentItem.mediaType.startsWith("video/");
  const previewUrl = currentItem.previewUrl || getPreviewUrl(currentItem.id, lightbox.albumId, currentItem.processedAt ?? currentItem.uploadedAt);
  const originalUrl = currentItem.originalUrl || getOriginalUrl(currentItem.id, lightbox.albumId);
  const hasMultiple = lightbox.batch.items.length > 1;
  const originalImage = useLightboxOriginalImage({ albumId: lightbox.albumId, currentItem });
  const hasPreview = currentItem.previewStatus === "ready";
  const showDownloadProgress = !isVideo && originalImage.status === "loading";
  const showRestoreMessage = !isVideo && originalImage.status === "restoring";
  const showUnavailableMessage = !isVideo && originalImage.status === "unavailable";

  useEffect(() => {
    if (closing) {
      setVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [closing]);

  useEffect(() => {
    setOriginalVisible(false);
  }, [currentItem.id, originalImage.objectUrl]);

  return (
    <div className={`lightboxOverlay${visible ? " lightboxOverlayOpen" : ""}${closing ? " lightboxOverlayClosing" : ""}`} onClick={onClose} role="dialog" aria-modal="true">
      <div className={`lightboxShell${visible ? " lightboxShellOpen" : ""}${closing ? " lightboxShellClosing" : ""}`} onClick={(event) => event.stopPropagation()}>
        <div className="lightboxTopBar">
          <div>
            <strong>{currentItem.fileName}</strong>
            <p>{lightbox.batch.uploadedByName || "家人"} · {formatRelativeUploadTime(lightbox.batch.uploadedAt)}</p>
          </div>
          <button className="lightboxClose" onClick={onClose} type="button">关闭</button>
        </div>

        <div
          className="lightboxStage"
          onTouchEnd={(event) => {
            if (touchStartX === null) {
              return;
            }
            const delta = event.changedTouches[0].clientX - touchStartX;
            setTouchStartX(null);
            if (Math.abs(delta) < 36 || !hasMultiple) {
              return;
            }
            onNavigate(delta > 0 ? -1 : 1);
          }}
          onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
        >
          {hasMultiple ? <button className="lightboxArrow lightboxArrowLeft" onClick={() => onNavigate(-1)} type="button">‹</button> : null}
          {isVideo ? (
            originalUrl ? (
              <video
                autoPlay
                className="lightboxVideo"
                controls
                playsInline
                poster={currentItem.previewStatus === "ready" ? previewUrl : undefined}
                src={originalUrl}
              />
            ) : (
              <div className="lightboxFallback">{currentItem.originalAvailability === "cold" || currentItem.originalAvailability === "restoring" ? "原视频正在从 NAS 恢复" : "原视频暂不可用"}</div>
            )
          ) : (
            <div className="lightboxMediaFrame">
              {hasPreview ? <img alt={currentItem.fileName} className="lightboxImage lightboxPreviewImage" decoding="async" src={previewUrl} /> : null}
              {originalImage.objectUrl ? (
                <img
                  alt={hasPreview ? "" : currentItem.fileName}
                  aria-hidden={hasPreview}
                  className={`lightboxImage lightboxOriginalImage${originalVisible ? " lightboxOriginalImageVisible" : ""}`}
                  decoding="async"
                  onError={() => setOriginalVisible(false)}
                  onLoad={() => setOriginalVisible(true)}
                  src={originalImage.objectUrl}
                />
              ) : null}
              {!hasPreview && !originalImage.objectUrl ? <div className="lightboxFallback">照片预览待生成</div> : null}
              {showRestoreMessage ? <div className="lightboxFallback">原图正在从 NAS 恢复，请稍候…</div> : null}
              {showUnavailableMessage ? <div className="lightboxFallback">原图暂不可用</div> : null}
              {showDownloadProgress ? <LightboxDownloadProgress progress={originalImage.progress} /> : null}
            </div>
          )}
          {hasMultiple ? <button className="lightboxArrow lightboxArrowRight" onClick={() => onNavigate(1)} type="button">›</button> : null}
        </div>

        <div className="lightboxBottomBar">
          <p>{formatDateTime(currentItem.capturedAt)}</p>
          <span>{lightbox.index + 1} / {lightbox.batch.items.length}</span>
        </div>
      </div>
    </div>
  );
}
