"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { loadTimelinePage } from "../../../../lib/api";
import type { AlbumWorkspace, AppStatePayload, TimelineEntry } from "../../../../lib/types";
import { TIMELINE_PAGE_SIZE } from "../../model/constants";
import { errorMessageFromUnknown } from "../../model/feedback";
import { mergeTimelineEntries } from "../../model/timeline";
import type { TabKey } from "../../model/types";

interface UseTimelineFeedOptions {
  activeTab: TabKey;
  activeAlbum: AlbumWorkspace | null;
  refreshApp: (targetAlbumId?: string, options?: { silent?: boolean }) => Promise<AppStatePayload | null>;
  showError: (title: string, message: string) => void;
}

export function useTimelineFeed({ activeTab, activeAlbum, refreshApp, showError }: UseTimelineFeedOptions) {
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineNextCursor, setTimelineNextCursor] = useState("");
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false);
  const [timelineRefreshing, setTimelineRefreshing] = useState(false);

  const tabScrollPositionsRef = useRef<Record<TabKey, number>>({ photos: 0, feeding: 0, settings: 0 });
  const timelineRequestRef = useRef(0);
  const timelineAlbumRef = useRef("");
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!activeAlbum) {
      return;
    }
    function handleScroll() {
      tabScrollPositionsRef.current[activeTab] = window.scrollY;
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeAlbum, activeTab]);

  useLayoutEffect(() => {
    if (!activeAlbum) {
      return;
    }
    const nextScrollTop = tabScrollPositionsRef.current[activeTab] ?? 0;
    window.scrollTo(0, nextScrollTop);
  }, [activeAlbum, activeTab]);

  async function replaceTimeline(albumId: string, limit = TIMELINE_PAGE_SIZE, showRefreshing = false) {
    const requestId = timelineRequestRef.current + 1;
    timelineRequestRef.current = requestId;
    if (showRefreshing) {
      setTimelineRefreshing(true);
    } else {
      setTimelineLoading(true);
    }
    try {
      const page = await loadTimelinePage(albumId, { limit });
      if (timelineRequestRef.current !== requestId) {
        return;
      }
      timelineAlbumRef.current = albumId;
      setTimelineEntries(page.items);
      setTimelineNextCursor(page.nextCursor ?? "");
      setTimelineHasMore(page.hasMore);
    } catch (error) {
      showError("时间线加载失败", errorMessageFromUnknown(error, "加载时间线失败。"));
    } finally {
      if (timelineRequestRef.current === requestId) {
        setTimelineLoading(false);
        setTimelineRefreshing(false);
      }
    }
  }

  async function loadMoreTimeline(albumId: string) {
    if (!timelineHasMore || !timelineNextCursor || timelineLoadingMore || timelineLoading || timelineRefreshing) {
      return;
    }
    setTimelineLoadingMore(true);
    try {
      const page = await loadTimelinePage(albumId, { cursor: timelineNextCursor, limit: TIMELINE_PAGE_SIZE });
      if (timelineAlbumRef.current !== albumId) {
        return;
      }
      setTimelineEntries((current) => mergeTimelineEntries(current, page.items));
      setTimelineNextCursor(page.nextCursor ?? "");
      setTimelineHasMore(page.hasMore);
    } catch (error) {
      showError("加载更多失败", errorMessageFromUnknown(error, "加载更多时间线失败。"));
    } finally {
      setTimelineLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!activeAlbum) {
      timelineAlbumRef.current = "";
      setTimelineEntries([]);
      setTimelineNextCursor("");
      setTimelineHasMore(false);
      setTimelineLoading(false);
      setTimelineLoadingMore(false);
      setTimelineRefreshing(false);
      return;
    }
    timelineAlbumRef.current = activeAlbum.album.id;
    setTimelineEntries([]);
    setTimelineNextCursor("");
    setTimelineHasMore(false);
    void replaceTimeline(activeAlbum.album.id);
  }, [activeAlbum?.album.id]);

  useEffect(() => {
    if (activeTab !== "photos" || !activeAlbum || !timelineHasMore || timelineLoading || timelineLoadingMore || timelineRefreshing) {
      return;
    }
    const target = loadMoreSentinelRef.current;
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) {
        return;
      }
      void loadMoreTimeline(activeAlbum.album.id);
    }, { rootMargin: "240px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [activeAlbum, activeTab, timelineHasMore, timelineLoading, timelineLoadingMore, timelineRefreshing, timelineNextCursor]);

  const hasPendingPreview = timelineEntries.some((entry) => entry.items.some((item) => item.previewStatus !== "ready"));

  useEffect(() => {
    if (!activeAlbum || !hasPendingPreview) {
      return;
    }
    const timer = window.setInterval(() => {
      void replaceTimeline(activeAlbum.album.id, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeAlbum, hasPendingPreview, timelineEntries.length]);

  function refreshTimelineSoon(targetAlbumId: string) {
    void replaceTimeline(targetAlbumId, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
    void refreshApp(targetAlbumId);
    window.setTimeout(() => {
      void replaceTimeline(targetAlbumId, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
      void refreshApp(targetAlbumId);
    }, 2000);
    window.setTimeout(() => {
      void replaceTimeline(targetAlbumId, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
      void refreshApp(targetAlbumId);
    }, 5000);
  }

  function captureTabScrollPosition(tab: TabKey) {
    tabScrollPositionsRef.current[tab] = window.scrollY;
  }

  return {
    timelineEntries,
    setTimelineEntries,
    timelineHasMore,
    timelineLoading,
    timelineLoadingMore,
    timelineRefreshing,
    loadMoreSentinelRef,
    replaceTimeline,
    refreshTimelineSoon,
    captureTabScrollPosition
  };
}
