"use client";

import { useEffect, useState } from "react";
import { getOriginalUrl, getPreviewUrl } from "../../../lib/api";
import { formatDateTime, formatRelativeUploadTime } from "../model/format";
import type { LightboxState } from "../model/types";

interface LightboxViewerProps {
  authToken: string;
  lightbox: LightboxState;
  closing: boolean;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
}

export function LightboxViewer({ authToken, lightbox, closing, onClose, onNavigate }: LightboxViewerProps) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const currentItem = lightbox.batch.items[lightbox.index];
  const isVideo = currentItem.mediaType.startsWith("video/");
  const originalUrl = getOriginalUrl(currentItem.id, lightbox.albumId, authToken);
  const previewUrl = getPreviewUrl(currentItem.id, lightbox.albumId, authToken, currentItem.processedAt ?? currentItem.uploadedAt);
  const hasMultiple = lightbox.batch.items.length > 1;
  const [displayUrl, setDisplayUrl] = useState(originalUrl);

  useEffect(() => {
    setDisplayUrl(originalUrl);
  }, [originalUrl]);

  useEffect(() => {
    if (closing) {
      setVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [closing]);

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
            <video
              autoPlay
              className="lightboxVideo"
              controls
              playsInline
              poster={currentItem.previewStatus === "ready" ? previewUrl : undefined}
              src={originalUrl}
            />
          ) : currentItem.previewStatus === "ready" ? (
            <img alt={currentItem.fileName} className="lightboxImage" onError={() => setDisplayUrl(previewUrl)} src={displayUrl} />
          ) : (
            <div className="lightboxFallback">{currentItem.mediaType.startsWith("video") ? "视频预览待生成" : "照片预览待生成"}</div>
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
