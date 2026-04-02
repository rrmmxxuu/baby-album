"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UploadDraftSheet } from "../../upload-draft-sheet";
import { useBackgroundUpload } from "../../upload-draft-sheet/hooks/use-background-upload";
import { DraftUploadProgressDialog } from "../../upload-draft-sheet/ui/draft-upload-progress-dialog";
import { useBabyRouteContext } from "../baby-route-context";
import { useTimelineState } from "../hooks/use-timeline-state";
import { LAST_VIEWED_PHOTO_BABY_STORAGE_KEY } from "../model/constants";
import { buildRelationLabels, buildTimelineFeed } from "../model/timeline";
import { buildBabyManageStoragePath, buildBabyPhotosPath } from "../model/routes";
import { useWorkspaceViewport } from "../workspace-viewport";
import { FloatingAddButton } from "../ui/floating-add-button";
import { LightboxViewer } from "../ui/lightbox-viewer";
import { PhotosTab } from "../ui/photos-tab";
import { UploadProgressFab } from "../ui/upload-progress-fab";

export function BabyPhotosRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedLightboxEntryId = searchParams.get("lightbox") ?? "";
  const requestedLightboxMediaId = searchParams.get("media") ?? "";
  const requestedComposer = searchParams.get("composer") ?? "";
  const requestedEditEntryId = searchParams.get("edit") ?? "";
  const { babyId, workspace, currentUser, joinedBabies, session, appView } = useBabyRouteContext();
  const workspaceViewport = useWorkspaceViewport();
  const timeline = useTimelineState({
    active: workspaceViewport.active,
    activeAlbum: workspace,
    scrollContainerRef: workspaceViewport.viewportRef,
    refreshApp: session.refreshApp,
    clearFeedback: session.clearFeedback,
    showWarning: session.showWarning,
    showError: session.showError
  });
  const backgroundUpload = useBackgroundUpload();
  const previousUploadPhaseRef = useRef(backgroundUpload.state.phase);

  const relationLabels = useMemo(() => buildRelationLabels(appView.albumMembers), [appView.albumMembers]);
  const timelineDays = useMemo(() => buildTimelineFeed(timeline.timelineEntries, appView.activeBaby?.birthDate, relationLabels), [appView.activeBaby?.birthDate, relationLabels, timeline.timelineEntries]);

  useEffect(() => {
    window.localStorage.setItem(LAST_VIEWED_PHOTO_BABY_STORAGE_KEY, babyId);
  }, [babyId]);

  useEffect(() => {
    if (!requestedLightboxEntryId) {
      if (timeline.lightbox && !timeline.lightboxClosing) {
        timeline.requestCloseLightbox();
      }
      return;
    }

    const matchingBatch = timelineDays.flatMap((day) => day.batches).find((batch) => batch.entry.id === requestedLightboxEntryId);
    if (!matchingBatch) {
      return;
    }
    const nextIndex = Math.max(0, matchingBatch.items.findIndex((item) => item.id === requestedLightboxMediaId));
    const nextMediaId = matchingBatch.items[nextIndex]?.id ?? "";
    const currentMediaId = timeline.lightbox ? timeline.lightbox.batch.items[timeline.lightbox.index]?.id ?? "" : "";
    const sameLightbox = Boolean(
      timeline.lightbox
      && !timeline.lightboxClosing
      && timeline.lightbox.batch.entry.id === requestedLightboxEntryId
      && currentMediaId === nextMediaId
    );
    if (sameLightbox) {
      return;
    }
    timeline.openLightbox({
      albumId: workspace.album.id,
      batch: matchingBatch,
      index: nextIndex
    });
  }, [requestedLightboxEntryId, requestedLightboxMediaId, timeline, timelineDays, workspace.album.id]);

  useEffect(() => {
    if (requestedEditEntryId) {
      if (!timeline.draftSheetOpen || timeline.editingEntry?.id !== requestedEditEntryId) {
        timeline.openEditEntry(requestedEditEntryId);
      }
      return;
    }
    if (requestedComposer === "new") {
      if (!timeline.draftSheetOpen || timeline.editingEntry) {
        timeline.openNewDraftSheet();
      }
      return;
    }
    if (timeline.draftSheetOpen) {
      timeline.closeDraftSheet();
    }
  }, [requestedComposer, requestedEditEntryId, timeline]);

  useEffect(() => {
    const previousPhase = previousUploadPhaseRef.current;
    const nextPhase = backgroundUpload.state.phase;
    if (previousPhase === nextPhase) {
      return;
    }
    previousUploadPhaseRef.current = nextPhase;

    if (nextPhase === "success") {
      if (timeline.draftSheetOpen) {
        handleCloseDraftSheet();
      }
      return;
    }

    if (nextPhase === "error") {
      session.showError("上传失败", backgroundUpload.state.errorMessage || "上传失败。");
      backgroundUpload.clear();
    }
  }, [backgroundUpload, session, timeline.draftSheetOpen]);

  function handleAlbumChange(nextBabyId: string) {
    if (nextBabyId === babyId) {
      return;
    }
    router.push(buildBabyPhotosPath(nextBabyId), { scroll: false });
  }

  async function handleOpenUploadFlow() {
    if (backgroundUpload.hasTask) {
      session.showWarning("正在上传", "当前已有上传进行中，完成后再试。");
      return;
    }
    const nextState = await session.refreshApp(workspace.album.id, { silent: true });
    const latestAlbum = nextState?.activeAlbum?.album.id === workspace.album.id ? nextState.activeAlbum : workspace;

    if (!latestAlbum || latestAlbum.album.id !== workspace.album.id) {
      session.showWarning("状态已变化", "当前宝宝状态已更新，请稍后重试。");
      return;
    }
    if (!latestAlbum.storageNode) {
      session.showWarning("还差一步", "请先为这个宝宝空间完成储存节点配对。");
      router.push(buildBabyManageStoragePath(babyId));
      return;
    }
    if (latestAlbum.membership.role === "viewer") {
      session.showWarning("没有权限", "当前身份没有上传权限。");
      return;
    }
    router.push(buildBabyPhotosPath(babyId, { composer: "new" }), { scroll: false });
  }

  function handleOpenLightbox(entryId: string, mediaId: string) {
    router.push(buildBabyPhotosPath(babyId, { lightboxEntryId: entryId, mediaId }), { scroll: false });
  }

  function handleNavigateLightbox(direction: -1 | 1) {
    if (!timeline.lightbox) {
      return;
    }
    const nextItem = timeline.lightbox.batch.items[timeline.lightbox.index + direction];
    if (!nextItem) {
      return;
    }
    router.replace(buildBabyPhotosPath(babyId, {
      lightboxEntryId: timeline.lightbox?.batch.entry.id,
      mediaId: nextItem.id
    }), { scroll: false });
  }

  function handleCloseLightbox() {
    router.replace(buildBabyPhotosPath(babyId), { scroll: false });
  }

  function handleOpenEditEntry(entryId: string) {
    router.push(buildBabyPhotosPath(babyId, { editEntryId: entryId }), { scroll: false });
  }

  function handleCloseDraftSheet() {
    router.replace(buildBabyPhotosPath(babyId), { scroll: false });
  }

  function handleMinimizeUpload() {
    backgroundUpload.minimize();
    handleCloseDraftSheet();
  }

  function handleOpenUploadDialog() {
    backgroundUpload.openDialog();
  }

  function handleCloseUploadError() {
    backgroundUpload.clear();
  }

  const showUploadFab = (backgroundUpload.state.phase === "uploading" && backgroundUpload.state.surface === "minimized")
    || backgroundUpload.state.phase === "success";

  return (
    <>
      <PhotosTab
        activeAlbum={workspace}
        activeBaby={appView.activeBaby}
        activeTab={true}
        albumOptions={joinedBabies}
        currentUserId={currentUser?.id}
        onAlbumChange={handleAlbumChange}
        onEditEntry={handleOpenEditEntry}
        onOpenLightbox={handleOpenLightbox}
        timeline={timeline}
        timelineDays={timelineDays}
      />

      {timeline.lightbox ? (
        <LightboxViewer
          key={`${timeline.lightbox.albumId}:${timeline.lightbox.batch.entry.id}`}
          closing={timeline.lightboxClosing}
          lightbox={timeline.lightbox}
          onClose={handleCloseLightbox}
          onNavigate={handleNavigateLightbox}
        />
      ) : null}

      <UploadDraftSheet
        albumId={workspace.album.id}
        backgroundUpload={backgroundUpload}
        babyName={appView.activeBaby?.name}
        disabled={!appView.canUploadMedia && !timeline.editingEntry}
        disabledReason={!appView.storageNode ? "上传前需要先完成储存节点配对。" : "当前身份没有上传权限。"}
        editingEntry={timeline.editingEntry}
        onClose={handleCloseDraftSheet}
        onDeleted={() => timeline.refreshTimelineSoon(workspace.album.id)}
        onUploaded={() => timeline.refreshTimelineSoon(workspace.album.id)}
        open={timeline.draftSheetOpen}
      />

      <DraftUploadProgressDialog onCloseError={handleCloseUploadError} onMinimize={handleMinimizeUpload} state={backgroundUpload.state} />
      {showUploadFab ? <UploadProgressFab onClick={handleOpenUploadDialog} state={backgroundUpload.state} /> : <FloatingAddButton onClick={handleOpenUploadFlow} />}
    </>
  );
}
