"use client";

import { useEffect, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import type { AlbumWorkspace } from "../../../../lib/types";
import { PULL_REFRESH_MAX, PULL_REFRESH_TRIGGER, TIMELINE_PAGE_SIZE } from "../../model/constants";
import type { LightboxState, TabKey } from "../../model/types";

interface UseTimelinePullRefreshOptions {
  activeTab: TabKey;
  activeAlbum: AlbumWorkspace | null;
  timelineEntriesLength: number;
  timelineLoading: boolean;
  timelineLoadingMore: boolean;
  timelineRefreshing: boolean;
  draftSheetOpen: boolean;
  lightbox: LightboxState | null;
  replaceTimeline: (albumId: string, limit?: number, showRefreshing?: boolean) => Promise<void>;
}

export function useTimelinePullRefresh({
  activeTab,
  activeAlbum,
  timelineEntriesLength,
  timelineLoading,
  timelineLoadingMore,
  timelineRefreshing,
  draftSheetOpen,
  lightbox,
  replaceTimeline
}: UseTimelinePullRefreshOptions) {
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [pullReady, setPullReady] = useState(false);

  function resetPullRefresh() {
    setPullStartY(null);
    setPullOffset(0);
    setPullReady(false);
  }

  useEffect(() => {
    if (activeTab !== "photos" || draftSheetOpen || lightbox) {
      resetPullRefresh();
    }
  }, [activeTab, draftSheetOpen, lightbox]);

  async function triggerPullRefresh() {
    if (!activeAlbum || timelineRefreshing || timelineLoading) {
      resetPullRefresh();
      return;
    }
    setPullOffset(56);
    await replaceTimeline(activeAlbum.album.id, Math.max(TIMELINE_PAGE_SIZE, timelineEntriesLength), true);
    resetPullRefresh();
  }

  function handlePhotosTouchStart(event: ReactTouchEvent<HTMLElement>) {
    if (activeTab !== "photos" || draftSheetOpen || lightbox || timelineLoadingMore || timelineRefreshing || event.touches.length !== 1) {
      return;
    }
    if (window.scrollY > 0) {
      return;
    }
    setPullStartY(event.touches[0].clientY);
  }

  function handlePhotosTouchMove(event: ReactTouchEvent<HTMLElement>) {
    if (pullStartY === null || draftSheetOpen || lightbox || activeTab !== "photos") {
      return;
    }
    if (window.scrollY > 0) {
      resetPullRefresh();
      return;
    }
    const delta = event.touches[0].clientY - pullStartY;
    if (delta <= 0) {
      resetPullRefresh();
      return;
    }
    event.preventDefault();
    const nextOffset = Math.min(PULL_REFRESH_MAX, delta * 0.42);
    setPullOffset(nextOffset);
    setPullReady(nextOffset >= PULL_REFRESH_TRIGGER);
  }

  function handlePhotosTouchEnd() {
    if (pullReady) {
      void triggerPullRefresh();
      return;
    }
    resetPullRefresh();
  }

  return {
    pullOffset,
    pullReady,
    handlePhotosTouchStart,
    handlePhotosTouchMove,
    handlePhotosTouchEnd,
    resetPullRefresh
  };
}
