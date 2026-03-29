"use client";

import type { AlbumWorkspace } from "../../../lib/types";
import { useTimelineComments } from "./timeline/use-timeline-comments";
import { useTimelineFeed } from "./timeline/use-timeline-feed";
import { useTimelineOverlays } from "./timeline/use-timeline-overlays";
import { useTimelinePullRefresh } from "./timeline/use-timeline-pull-refresh";
import type { TabKey } from "../model/types";

interface UseTimelineStateOptions {
  activeTab: TabKey;
  authToken: string;
  activeAlbum: AlbumWorkspace | null;
  refreshApp: (targetAlbumId?: string, options?: { silent?: boolean }) => Promise<void>;
  clearFeedback: () => void;
  showWarning: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}

export function useTimelineState({ activeTab, authToken, activeAlbum, refreshApp, clearFeedback, showWarning, showError }: UseTimelineStateOptions) {
  const feed = useTimelineFeed({
    activeTab,
    authToken,
    activeAlbum,
    refreshApp,
    showError
  });

  const overlays = useTimelineOverlays({
    timelineEntries: feed.timelineEntries
  });

  const comments = useTimelineComments({
    authToken,
    activeAlbum,
    setTimelineEntries: feed.setTimelineEntries,
    clearFeedback,
    showWarning,
    showError
  });

  const pullRefresh = useTimelinePullRefresh({
    activeTab,
    activeAlbum,
    timelineEntriesLength: feed.timelineEntries.length,
    timelineLoading: feed.timelineLoading,
    timelineLoadingMore: feed.timelineLoadingMore,
    timelineRefreshing: feed.timelineRefreshing,
    draftSheetOpen: overlays.draftSheetOpen,
    lightbox: overlays.lightbox,
    replaceTimeline: feed.replaceTimeline
  });

  return {
    timelineEntries: feed.timelineEntries,
    timelineHasMore: feed.timelineHasMore,
    timelineLoading: feed.timelineLoading,
    timelineLoadingMore: feed.timelineLoadingMore,
    timelineRefreshing: feed.timelineRefreshing,
    commentComposerEntryId: comments.commentComposerEntryId,
    commentSubmittingEntryId: comments.commentSubmittingEntryId,
    commentDrafts: comments.commentDrafts,
    setCommentDraft: comments.setCommentDraft,
    toggleCommentComposer: comments.toggleCommentComposer,
    handleCreateComment: comments.handleCreateComment,
    loadMoreSentinelRef: feed.loadMoreSentinelRef,
    pullOffset: pullRefresh.pullOffset,
    pullReady: pullRefresh.pullReady,
    handlePhotosTouchStart: pullRefresh.handlePhotosTouchStart,
    handlePhotosTouchMove: pullRefresh.handlePhotosTouchMove,
    handlePhotosTouchEnd: pullRefresh.handlePhotosTouchEnd,
    resetPullRefresh: pullRefresh.resetPullRefresh,
    lightbox: overlays.lightbox,
    lightboxClosing: overlays.lightboxClosing,
    openLightbox: overlays.openLightbox,
    navigateLightbox: overlays.navigateLightbox,
    requestCloseLightbox: overlays.requestCloseLightbox,
    draftSheetOpen: overlays.draftSheetOpen,
    editingEntry: overlays.editingEntry,
    openNewDraftSheet: overlays.openNewDraftSheet,
    openEditEntry: overlays.openEditEntry,
    closeDraftSheet: overlays.closeDraftSheet,
    refreshTimelineSoon: feed.refreshTimelineSoon,
    captureTabScrollPosition: feed.captureTabScrollPosition
  };
}

export type TimelineState = ReturnType<typeof useTimelineState>;
