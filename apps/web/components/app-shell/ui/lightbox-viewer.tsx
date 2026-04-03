"use client";

import { useEffect, useRef, useState } from "react";
import { getOriginalUrl, getPreviewUrl, getScreenPreviewUrl, loadOriginalStatus, repairMediaPreview } from "../../../lib/api";
import type { MediaAsset } from "../../../lib/types";
import { useLightboxOriginalImage } from "../hooks/use-lightbox-original-image";
import { formatDateTime, formatRelativeUploadTime } from "../model/format";
import type { LightboxState } from "../model/types";

const VIDEO_RESTORE_POLL_INTERVAL_MS = 3000;
const VIDEO_URL_REFRESH_SKEW_MS = 30_000;

interface LightboxViewerProps {
  lightbox: LightboxState;
  closing: boolean;
  onClose: () => void;
  onNavigate: (direction: -1 | 1) => void;
  onPreviewRepair?: (media: MediaAsset) => void;
}

function originalUrlNeedsRefresh(url: string) {
  try {
    const parsed = new URL(url, window.location.origin);
    const expiry = Number(parsed.searchParams.get("exp"));
    if (!Number.isFinite(expiry) || expiry <= 0) {
      return false;
    }
    return expiry * 1000 <= Date.now() + VIDEO_URL_REFRESH_SKEW_MS;
  } catch {
    return false;
  }
}

function LightboxDownloadProgress({ progress, label }: { progress: number | null; label: string }) {
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
      aria-label={label}
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={percent}
      aria-valuetext={percent === undefined ? label : `原图已下载 ${percent}%`}
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

export function LightboxViewer({ lightbox, closing, onClose, onNavigate, onPreviewRepair }: LightboxViewerProps) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [visible, setVisible] = useState(false);
  const [visibleOriginalUrl, setVisibleOriginalUrl] = useState("");
  const [videoOriginalUrl, setVideoOriginalUrl] = useState("");
  const [videoState, setVideoState] = useState<"idle" | "ready" | "restoring" | "unavailable">("idle");
  const [videoRefreshNonce, setVideoRefreshNonce] = useState(0);
  const [originalRequestedMediaId, setOriginalRequestedMediaId] = useState("");
  const [screenPreviewOverrideUrl, setScreenPreviewOverrideUrl] = useState("");
  const [screenPreviewOverrideStatus, setScreenPreviewOverrideStatus] = useState<"pending" | "ready" | "unavailable" | "">("");
  const handledVideoRefreshNonceRef = useRef(0);
  const currentItem = lightbox.batch.items[lightbox.index];
  const isVideo = currentItem.mediaType.startsWith("video/");
  const previewUrl = screenPreviewOverrideUrl
    || currentItem.screenPreviewUrl
    || currentItem.previewUrl
    || getScreenPreviewUrl(currentItem.id, lightbox.albumId, currentItem.processedAt ?? currentItem.uploadedAt)
    || getPreviewUrl(currentItem.id, lightbox.albumId, currentItem.processedAt ?? currentItem.uploadedAt);
  const hasMultiple = lightbox.batch.items.length > 1;
  const originalRequested = originalRequestedMediaId === currentItem.id;
  const originalImage = useLightboxOriginalImage({ albumId: lightbox.albumId, currentItem, enabled: originalRequested && !isVideo });
  const hasPreview = screenPreviewOverrideStatus === "ready" || currentItem.screenPreviewStatus === "ready" || currentItem.previewStatus === "ready";
  const hasPrevious = lightbox.index > 0;
  const hasNext = lightbox.index < lightbox.batch.items.length - 1;
  const originalImageVisible = Boolean(originalImage.objectUrl) && visibleOriginalUrl === originalImage.objectUrl;
  const showImageProgressBadge = !isVideo && (originalImage.status === "loading" || originalImage.status === "restoring");
  const showVideoRestoreBadge = isVideo && videoState === "restoring";
  const showUnavailableMessage = !isVideo && originalImage.status === "unavailable";
  const canRequestOriginal = currentItem.originalAvailability !== "unavailable" || Boolean(currentItem.originalUrl);

  useEffect(() => {
    if (closing) {
      setVisible(false);
      return;
    }
    const frame = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(frame);
  }, [closing]);

  useEffect(() => {
    if (!isVideo) {
      setVideoOriginalUrl("");
      setVideoState("idle");
      return;
    }
    if (!originalRequested) {
      setVideoOriginalUrl("");
      setVideoState("idle");
      return;
    }
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    const forceStatusRefresh = videoRefreshNonce !== handledVideoRefreshNonceRef.current;

    async function refreshVideoUrl(triggerRestore: boolean) {
      try {
        const result = await loadOriginalStatus(lightbox.albumId, currentItem.id, { triggerRestore });
        if (cancelled) {
          return;
        }
        if ((result.originalAvailability === "hot" || result.originalAvailability === "warm") && result.originalUrl) {
          setVideoOriginalUrl(result.originalUrl);
          setVideoState("ready");
          return;
        }
        if (result.originalAvailability === "cold" || result.originalAvailability === "restoring") {
          setVideoOriginalUrl("");
          setVideoState("restoring");
          pollTimer = setTimeout(() => {
            void refreshVideoUrl(false);
          }, VIDEO_RESTORE_POLL_INTERVAL_MS);
          return;
        }
        setVideoOriginalUrl("");
        setVideoState("unavailable");
      } catch {
        if (!cancelled) {
          setVideoOriginalUrl("");
          setVideoState("unavailable");
        }
      }
    }

    if (currentItem.originalAvailability === "hot" || currentItem.originalAvailability === "warm") {
      if (currentItem.originalUrl && !forceStatusRefresh && !originalUrlNeedsRefresh(currentItem.originalUrl)) {
        setVideoOriginalUrl(currentItem.originalUrl);
        setVideoState("ready");
      } else {
        handledVideoRefreshNonceRef.current = videoRefreshNonce;
        setVideoOriginalUrl("");
        setVideoState("idle");
        void refreshVideoUrl(false);
      }
    } else if (currentItem.originalAvailability === "cold" || currentItem.originalAvailability === "restoring") {
      setVideoOriginalUrl("");
      setVideoState("restoring");
      void refreshVideoUrl(currentItem.originalAvailability === "cold");
    } else if (currentItem.originalUrl) {
      setVideoOriginalUrl(currentItem.originalUrl);
      setVideoState("ready");
    } else {
      setVideoOriginalUrl("");
      setVideoState("unavailable");
    }

    return () => {
      cancelled = true;
      if (pollTimer) {
        clearTimeout(pollTimer);
      }
    };
  }, [currentItem.id, currentItem.originalAvailability, currentItem.originalUrl, isVideo, lightbox.albumId, originalRequested, videoRefreshNonce]);

  useEffect(() => {
    setOriginalRequestedMediaId("");
    setScreenPreviewOverrideUrl("");
    setScreenPreviewOverrideStatus("");
  }, [currentItem.id]);

  useEffect(() => {
    if (currentItem.screenPreviewStatus === "ready") {
      return;
    }
    let cancelled = false;
    void repairMediaPreview(lightbox.albumId, currentItem.id).then((result) => {
      if (cancelled) {
        return;
      }
      setScreenPreviewOverrideStatus(result.media.screenPreviewStatus ?? "");
      setScreenPreviewOverrideUrl(result.media.screenPreviewUrl ?? "");
      onPreviewRepair?.(result.media);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [currentItem.id, currentItem.previewStatus, currentItem.screenPreviewStatus, lightbox.albumId, onPreviewRepair]);

  function handleRequestOriginal() {
    setOriginalRequestedMediaId(currentItem.id);
    if (!isVideo) {
      originalImage.requestDownload();
      return;
    }
    setVideoRefreshNonce((value) => value + 1);
  }

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
            if (delta > 0) {
              if (!hasPrevious) {
                return;
              }
              onNavigate(-1);
              return;
            }
            if (!hasNext) {
              return;
            }
            onNavigate(1);
          }}
          onTouchStart={(event) => setTouchStartX(event.touches[0].clientX)}
        >
          {hasPrevious ? <button className="lightboxArrow lightboxArrowLeft" onClick={() => onNavigate(-1)} type="button">‹</button> : null}
          {isVideo ? (
            videoOriginalUrl ? (
              <video
                autoPlay
                className="lightboxVideo"
                controls
                key={`${currentItem.id}:${videoRefreshNonce}:${videoOriginalUrl}`}
                playsInline
                onError={() => {
                  setVideoOriginalUrl("");
                  setVideoState("idle");
                  setVideoRefreshNonce((value) => value + 1);
                }}
                poster={currentItem.previewStatus === "ready" ? previewUrl : undefined}
                src={videoOriginalUrl || getOriginalUrl(currentItem.id, lightbox.albumId)}
              />
            ) : (
              <div className="lightboxMediaFrame">
                {hasPreview ? <img alt={currentItem.fileName} className="lightboxImage lightboxPreviewImage" decoding="async" src={previewUrl} /> : null}
                {!hasPreview || videoState === "unavailable" ? (
                  <div className="lightboxFallback">
                    {videoState === "unavailable" ? "原视频暂不可用" : ""}
                  </div>
                ) : null}
                {showVideoRestoreBadge ? <LightboxDownloadProgress label="原视频正在从 NAS 恢复" progress={null} /> : null}
              </div>
            )
          ) : (
            <div className="lightboxMediaFrame">
              {hasPreview ? <img alt={currentItem.fileName} className="lightboxImage lightboxPreviewImage" decoding="async" src={previewUrl} /> : null}
              {originalImage.objectUrl ? (
                <img
                  alt={hasPreview ? "" : currentItem.fileName}
                  aria-hidden={hasPreview}
                  className={`lightboxImage lightboxOriginalImage${originalImageVisible ? " lightboxOriginalImageVisible" : ""}`}
                  decoding="async"
                  key={`${currentItem.id}:${originalImage.objectUrl}`}
                  onError={() => setVisibleOriginalUrl("")}
                  onLoad={() => setVisibleOriginalUrl(originalImage.objectUrl)}
                  src={originalImage.objectUrl}
                />
              ) : null}
              {!hasPreview && !originalImage.objectUrl ? <div className="lightboxFallback">照片预览待生成</div> : null}
              {showUnavailableMessage ? <div className="lightboxFallback">原图暂不可用</div> : null}
              {showImageProgressBadge ? (
                <LightboxDownloadProgress
                  label={originalImage.status === "restoring" ? "原图正在从 NAS 恢复" : "正在下载原图"}
                  progress={originalImage.status === "loading" ? originalImage.progress : null}
                />
              ) : null}
            </div>
          )}
          {hasNext ? <button className="lightboxArrow lightboxArrowRight" onClick={() => onNavigate(1)} type="button">›</button> : null}
        </div>

        <div className="lightboxBottomBar">
          <p>{formatDateTime(currentItem.capturedAt)}</p>
          <div className="lightboxBottomActions">
            {canRequestOriginal && (!isVideo ? !originalImage.objectUrl : !videoOriginalUrl) ? (
              <button className="lightboxOriginalAction" onClick={handleRequestOriginal} type="button">
                {isVideo ? "加载原视频" : "加载原图"}
              </button>
            ) : null}
            <span>{lightbox.index + 1} / {lightbox.batch.items.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
