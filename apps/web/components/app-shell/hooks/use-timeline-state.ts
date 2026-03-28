"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import { createTimelineComment, loadTimelinePage } from "../../../lib/api";
import type { AlbumWorkspace, TimelineEntry, User } from "../../../lib/types";
import { OVERLAY_EXIT_MS, PULL_REFRESH_MAX, PULL_REFRESH_TRIGGER, TIMELINE_PAGE_SIZE } from "../model/constants";
import { mergeTimelineEntries, moveLightbox } from "../model/timeline";
import type { LightboxState, TabKey } from "../model/types";

interface UseTimelineStateOptions {
  activeTab: TabKey;
  authToken: string;
  activeAlbum: AlbumWorkspace | null;
  currentUser: User | null;
  refreshApp: (targetAlbumId?: string, options?: { silent?: boolean }) => Promise<void>;
  setError: (value: string | null) => void;
}

export function useTimelineState({ activeTab, authToken, activeAlbum, currentUser, refreshApp, setError }: UseTimelineStateOptions) {
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineNextCursor, setTimelineNextCursor] = useState("");
  const [timelineHasMore, setTimelineHasMore] = useState(false);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineLoadingMore, setTimelineLoadingMore] = useState(false);
  const [timelineRefreshing, setTimelineRefreshing] = useState(false);
  const [pullStartY, setPullStartY] = useState<number | null>(null);
  const [pullOffset, setPullOffset] = useState(0);
  const [pullReady, setPullReady] = useState(false);
  const [commentComposerEntryId, setCommentComposerEntryId] = useState("");
  const [commentSubmittingEntryId, setCommentSubmittingEntryId] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);
  const [lightboxClosing, setLightboxClosing] = useState(false);
  const [draftSheetOpen, setDraftSheetOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);

  const tabScrollPositionsRef = useRef<Record<TabKey, number>>({ photos: 0, settings: 0 });
  const timelineRequestRef = useRef(0);
  const timelineAlbumRef = useRef("");
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setCommentComposerEntryId("");
    setCommentSubmittingEntryId("");
    setCommentDrafts({});
  }, [activeAlbum?.album.id]);

  useEffect(() => {
    if (!authToken || !activeAlbum) {
      return;
    }
    function handleScroll() {
      tabScrollPositionsRef.current[activeTab] = window.scrollY;
    }
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [activeAlbum, activeTab, authToken]);

  useLayoutEffect(() => {
    if (!authToken || !activeAlbum) {
      return;
    }
    const nextScrollTop = tabScrollPositionsRef.current[activeTab] ?? 0;
    window.scrollTo(0, nextScrollTop);
  }, [activeAlbum, activeTab, authToken]);

  useEffect(() => {
    if (!lightbox && !draftSheetOpen) {
      return;
    }
    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, scrollY);
    };
  }, [draftSheetOpen, lightbox]);

  useEffect(() => {
    if (!lightbox) {
      return;
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        requestCloseLightbox();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        navigateLightbox(-1);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        navigateLightbox(1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox]);

  useEffect(() => {
    if (!lightboxClosing) {
      return;
    }
    const timer = window.setTimeout(() => {
      setLightbox(null);
      setLightboxClosing(false);
    }, OVERLAY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [lightboxClosing]);

  useEffect(() => {
    if (draftSheetOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      setEditingEntry(null);
    }, OVERLAY_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [draftSheetOpen]);

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

  async function replaceTimeline(albumId: string, limit = TIMELINE_PAGE_SIZE, showRefreshing = false) {
    if (!authToken) {
      return;
    }
    const requestId = timelineRequestRef.current + 1;
    timelineRequestRef.current = requestId;
    if (showRefreshing) {
      setTimelineRefreshing(true);
    } else {
      setTimelineLoading(true);
    }
    try {
      const page = await loadTimelinePage(authToken, albumId, { limit });
      if (timelineRequestRef.current !== requestId) {
        return;
      }
      timelineAlbumRef.current = albumId;
      setTimelineEntries(page.items);
      setTimelineNextCursor(page.nextCursor ?? "");
      setTimelineHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载时间线失败。");
    } finally {
      if (timelineRequestRef.current === requestId) {
        setTimelineLoading(false);
        setTimelineRefreshing(false);
      }
    }
  }

  async function loadMoreTimeline(albumId: string) {
    if (!authToken || !timelineHasMore || !timelineNextCursor || timelineLoadingMore || timelineLoading || timelineRefreshing) {
      return;
    }
    setTimelineLoadingMore(true);
    try {
      const page = await loadTimelinePage(authToken, albumId, { cursor: timelineNextCursor, limit: TIMELINE_PAGE_SIZE });
      if (timelineAlbumRef.current !== albumId) {
        return;
      }
      setTimelineEntries((current) => mergeTimelineEntries(current, page.items));
      setTimelineNextCursor(page.nextCursor ?? "");
      setTimelineHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载更多时间线失败。");
    } finally {
      setTimelineLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!authToken || !activeAlbum) {
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
  }, [activeAlbum?.album.id, authToken]);

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
    if (!authToken || !activeAlbum || !hasPendingPreview) {
      return;
    }
    const timer = window.setInterval(() => {
      void replaceTimeline(activeAlbum.album.id, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeAlbum, authToken, hasPendingPreview, timelineEntries.length]);

  function toggleCommentComposer(entryId: string) {
    setCommentComposerEntryId((current) => current === entryId ? "" : entryId);
  }

  function setCommentDraft(entryId: string, value: string) {
    setCommentDrafts((current) => ({ ...current, [entryId]: value }));
  }

  async function handleCreateComment(entryId: string) {
    if (!authToken || !activeAlbum) {
      return;
    }
    const content = (commentDrafts[entryId] ?? "").trim();
    if (!content) {
      setError("请输入评论内容。");
      return;
    }
    setError(null);
    setCommentSubmittingEntryId(entryId);
    try {
      const comment = await createTimelineComment(authToken, entryId, {
        albumId: activeAlbum.album.id,
        content
      });
      setTimelineEntries((current) => current.map((entry) => entry.id === entryId ? { ...entry, comments: [...entry.comments, comment] } : entry));
      setCommentDrafts((current) => ({ ...current, [entryId]: "" }));
      setCommentComposerEntryId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "发表评论失败。");
    } finally {
      setCommentSubmittingEntryId("");
    }
  }

  function openLightbox(next: LightboxState) {
    setLightboxClosing(false);
    setLightbox(next);
  }

  function navigateLightbox(direction: -1 | 1) {
    setLightbox((current) => current ? moveLightbox(current, direction) : current);
  }

  function requestCloseLightbox() {
    if (!lightbox || lightboxClosing) {
      return;
    }
    setLightboxClosing(true);
  }

  async function triggerPullRefresh() {
    if (!activeAlbum || timelineRefreshing || timelineLoading) {
      resetPullRefresh();
      return;
    }
    setPullOffset(56);
    await replaceTimeline(activeAlbum.album.id, Math.max(TIMELINE_PAGE_SIZE, timelineEntries.length), true);
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

  function openNewDraftSheet() {
    setEditingEntry(null);
    setDraftSheetOpen(true);
  }

  function openEditEntry(entryId: string) {
    const entry = timelineEntries.find((item) => item.id === entryId) ?? null;
    if (!entry) {
      return;
    }
    setEditingEntry(entry);
    setDraftSheetOpen(true);
  }

  function closeDraftSheet() {
    setDraftSheetOpen(false);
  }

  function captureTabScrollPosition(tab: TabKey) {
    tabScrollPositionsRef.current[tab] = window.scrollY;
  }

  return {
    timelineEntries,
    timelineHasMore,
    timelineLoading,
    timelineLoadingMore,
    timelineRefreshing,
    commentComposerEntryId,
    commentSubmittingEntryId,
    commentDrafts,
    setCommentDraft,
    toggleCommentComposer,
    handleCreateComment,
    loadMoreSentinelRef,
    pullOffset,
    pullReady,
    handlePhotosTouchStart,
    handlePhotosTouchMove,
    handlePhotosTouchEnd,
    resetPullRefresh,
    lightbox,
    lightboxClosing,
    openLightbox,
    navigateLightbox,
    requestCloseLightbox,
    draftSheetOpen,
    editingEntry,
    openNewDraftSheet,
    openEditEntry,
    closeDraftSheet,
    refreshTimelineSoon,
    captureTabScrollPosition
  };
}

export type TimelineState = ReturnType<typeof useTimelineState>;
