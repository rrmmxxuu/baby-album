"use client";

import { useEffect, useRef, useState } from "react";
import { ensureLocalPreviewUrl, ensureLocalStillImagePreviewUrl, ensureLocalVideoPosterUrl } from "../model/local-media";
import type { DraftMedia } from "../model/types";

interface DraftMediaThumbProps {
  item: DraftMedia;
}

export function DraftMediaThumb({ item }: DraftMediaThumbProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(!item.file);
  const [previewUrl, setPreviewUrl] = useState(item.previewUrl ?? "");
  const [posterUrl, setPosterUrl] = useState(item.posterUrl ?? "");

  useEffect(() => {
    setShouldLoad(!item.file);
    setPreviewUrl(item.previewUrl ?? "");
    setPosterUrl(item.posterUrl ?? "");
  }, [item.file, item.id, item.posterUrl, item.previewUrl]);

  useEffect(() => {
    if (!item.file || shouldLoad) {
      return;
    }
    const target = containerRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) {
        return;
      }
      setShouldLoad(true);
      observer.disconnect();
    }, { rootMargin: "240px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [item.file, shouldLoad]);

  useEffect(() => {
    if (!shouldLoad) {
      return;
    }
    if (!item.file) {
      setPreviewUrl(item.previewUrl ?? "");
      return;
    }
    if (item.mediaType.startsWith("video/")) {
      setPreviewUrl(ensureLocalPreviewUrl(item.file));
      return;
    }
    let cancelled = false;
    void ensureLocalStillImagePreviewUrl(item.file, item.mediaType)
      .then((nextPreviewUrl) => {
        if (!cancelled) {
          setPreviewUrl(nextPreviewUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewUrl("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [item.file, item.mediaType, item.previewUrl, shouldLoad]);

  useEffect(() => {
    if (!item.mediaType.startsWith("video/")) {
      return;
    }
    if (!shouldLoad) {
      return;
    }
    if (!item.file) {
      setPosterUrl(item.posterUrl ?? item.previewUrl ?? "");
      return;
    }
    let cancelled = false;
    void ensureLocalVideoPosterUrl(item.file)
      .then((nextPosterUrl) => {
        if (!cancelled) {
          setPosterUrl(nextPosterUrl);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [item.file, item.mediaType, item.posterUrl, item.previewUrl, shouldLoad]);

  if (item.mediaType.startsWith("video/")) {
    return (
      <div className="draftMediaThumb draftMediaThumbVideo" ref={containerRef}>
        {item.file ? (
          previewUrl ? <video aria-label={item.fileName} className="draftMediaThumbVideoElement" muted playsInline poster={posterUrl || undefined} preload="metadata" src={previewUrl} /> : <div aria-label={item.fileName} className="draftMediaThumbFallback" role="img">视频</div>
        ) : (
          previewUrl ? <img alt={item.fileName} className="draftMediaThumbImage" decoding="async" loading="lazy" src={posterUrl || previewUrl} /> : <div aria-label={item.fileName} className="draftMediaThumbFallback" role="img">视频</div>
        )}
        <span aria-hidden="true" className="draftMediaThumbBadge">视频</span>
      </div>
    );
  }

  return (
    <div className="draftMediaThumb" ref={containerRef}>
      {previewUrl ? <img alt={item.fileName} className="draftMediaThumbImage" decoding="async" loading="lazy" src={previewUrl} /> : <div aria-label={item.fileName} className="draftMediaThumbFallback" role="img">照片</div>}
    </div>
  );
}
