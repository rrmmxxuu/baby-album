"use client";

import { useEffect, useRef } from "react";
import { getPreviewUrl, repairMediaPreview } from "../../../lib/api";
import type { MediaAsset } from "../../../lib/types";

interface MomentThumbProps {
  albumId: string;
  item: MediaAsset;
  large?: boolean;
  onOpen?: () => void;
  onPreviewRepair?: () => void;
}

const repairCooldownByMediaId = new Map<string, number>();
const repairInFlightByMediaId = new Map<string, Promise<void>>();
const REPAIR_COOLDOWN_MS = 30_000;

function triggerPreviewRepair(albumId: string, item: MediaAsset, onPreviewRepair?: () => void) {
  const existing = repairInFlightByMediaId.get(item.id);
  if (existing) {
    return existing;
  }
  const lastAttemptAt = repairCooldownByMediaId.get(item.id) ?? 0;
  if (Date.now() - lastAttemptAt < REPAIR_COOLDOWN_MS) {
    return Promise.resolve();
  }
  repairCooldownByMediaId.set(item.id, Date.now());
  const task = repairMediaPreview(albumId, item.id)
    .then(() => {
      onPreviewRepair?.();
    })
    .catch(() => {})
    .finally(() => {
      repairInFlightByMediaId.delete(item.id);
    });
  repairInFlightByMediaId.set(item.id, task);
  return task;
}

export function MomentThumb({ albumId, item, large, onOpen, onPreviewRepair }: MomentThumbProps) {
  const previewUrl = item.previewUrl || getPreviewUrl(item.id, albumId, item.processedAt ?? item.uploadedAt);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (item.previewStatus === "ready" && item.screenPreviewStatus === "ready") {
      return;
    }
    const target = buttonRef.current;
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      void triggerPreviewRepair(albumId, item, onPreviewRepair);
      observer.disconnect();
    }, { rootMargin: "400px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [albumId, item, onPreviewRepair]);

  return (
    <button className={`momentThumb${large ? " momentThumbLarge" : ""}`} onClick={onOpen} ref={buttonRef} type="button">
      {item.previewStatus === "ready" ? (
        <img alt={item.fileName} className="momentThumbImage" decoding="async" loading="lazy" src={previewUrl} />
      ) : (
        <div className="momentThumbFallback">{item.mediaType.startsWith("video") ? "视频" : "照片"}</div>
      )}
    </button>
  );
}
