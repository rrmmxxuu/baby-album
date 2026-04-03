"use client";

import type { RefObject } from "react";
import type { AlbumWorkspace, AppStatePayload, MediaAsset } from "../../../lib/types";
import { useTimelineComments } from "./timeline/use-timeline-comments";
import { useTimelineFeed } from "./timeline/use-timeline-feed";
import { useTimelineOverlays } from "./timeline/use-timeline-overlays";
import { useTimelinePullRefresh } from "./timeline/use-timeline-pull-refresh";

interface UseTimelineStateOptions {
  active: boolean;
  activeAlbum: AlbumWorkspace | null;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  refreshApp: (targetAlbumId?: string, options?: { silent?: boolean }) => Promise<AppStatePayload | null>;
  clearFeedback: () => void;
  showWarning: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
}

export function useTimelineState({ active, activeAlbum, scrollContainerRef, refreshApp, clearFeedback, showWarning, showError }: UseTimelineStateOptions) {
  const feed = useTimelineFeed({
    active,
    activeAlbum,
    scrollContainerRef,
    refreshApp,
    showError
  });

  const overlays = useTimelineOverlays({
    scrollContainerRef,
    timelineEntries: feed.timelineEntries
  });

  const comments = useTimelineComments({
    activeAlbum,
    setTimelineEntries: feed.setTimelineEntries,
    clearFeedback,
    showWarning,
    showError
  });

  const pullRefresh = useTimelinePullRefresh({
    active,
    activeAlbum,
    scrollContainerRef,
    timelineEntriesLength: feed.timelineEntries.length,
    timelineLoading: feed.timelineLoading,
    timelineLoadingMore: feed.timelineLoadingMore,
    timelineRefreshing: feed.timelineRefreshing,
    draftSheetOpen: overlays.draftSheetOpen,
    lightbox: overlays.lightbox,
    replaceTimeline: feed.replaceTimeline
  });

  function patchMediaAsset(updatedMedia: MediaAsset) {
    feed.patchMediaAsset(updatedMedia);
    overlays.patchMediaAsset(updatedMedia);
  }

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
    patchMediaAsset
  };
}

export type TimelineState = ReturnType<typeof useTimelineState>;
