"use client";

import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UploadDraftSheet } from "../../upload-draft-sheet";
import { useBackgroundUpload } from "../../upload-draft-sheet/hooks/use-background-upload";
import { DraftUploadProgressDialog } from "../../upload-draft-sheet/ui/draft-upload-progress-dialog";
import { AlbumRouteProvider } from "../album-route-context";
import { useAppSessionContext } from "../app-session-provider";
import { useSettingsState } from "../hooks/use-settings-state";
import { useTimelineState } from "../hooks/use-timeline-state";
import { buildRelationLabels, buildTimelineFeed } from "../model/timeline";
import { buildAlbumPath, buildAuthPath, buildPhotosPath, parseSettingsScreen, resolveAlbumRedirect } from "../model/routes";
import { buildAppShellViewModel } from "../model/view";
import type { SettingsScreen, TabKey } from "../model/types";
import { AppPageFrame } from "../ui/app-page-frame";
import { BottomNav } from "../ui/bottom-nav";
import { FloatingAddButton } from "../ui/floating-add-button";
import { LightboxViewer } from "../ui/lightbox-viewer";
import { UploadProgressFab } from "../ui/upload-progress-fab";
import { PhotosRoute } from "./photos-route";
import { RouteRedirect } from "./route-redirect-notice";
import { SettingsRoute } from "./settings-route";

interface AlbumRouteShellProps {
  albumId: string;
  children: React.ReactNode;
}

const SETTINGS_SCREEN_DEPTH: Record<SettingsScreen, number> = {
  menu: 0,
  account: 1,
  babies: 1,
  storage: 1,
  addBaby: 2,
  babyDetail: 2,
  memberDetail: 3
};

function toTab(pathname: string): TabKey {
  return pathname.endsWith("/settings") ? "settings" : "photos";
}

function isRouteScreen(screen: SettingsScreen) {
  return screen !== "menu";
}

export function AlbumRouteShell({ albumId, children: _children }: AlbumRouteShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const session = useAppSessionContext();
  const [scenePathname, setScenePathname] = useState(pathname);
  const [sceneSearch, setSceneSearch] = useState(search);
  const sceneSearchParams = useMemo(() => new URLSearchParams(sceneSearch), [sceneSearch]);
  const requestedScreen = parseSettingsScreen(sceneSearchParams.get("screen"));
  const requestedMemberId = sceneSearchParams.get("memberId") ?? "";
  const requestedLightboxEntryId = sceneSearchParams.get("lightbox") ?? "";
  const requestedLightboxMediaId = sceneSearchParams.get("media") ?? "";
  const requestedComposer = sceneSearchParams.get("composer") ?? "";
  const requestedEditEntryId = sceneSearchParams.get("edit") ?? "";
  const activeTab = toTab(scenePathname);
  const requestedScreenKeyRef = useRef("");
  const settingsRefreshKeyRef = useRef("");
  const inviteCode = sceneSearchParams.get("invite") ?? "";

  const activeAlbum = session.appState?.activeAlbum ?? null;
  const albumOptions = session.appState?.albums ?? [];
  const currentUser = session.appState?.currentUser ?? null;
  const activeAlbumId = activeAlbum?.album.id ?? null;
  const albumRefreshing = Boolean(session.isAuthenticated && albumId && activeAlbumId && activeAlbumId !== albumId);

  const settings = useSettingsState({
    activeTab,
    appState: session.appState,
    activeAlbum,
    currentUser,
    refreshApp: session.refreshApp,
    clearFeedback: session.clearFeedback,
    showSuccess: session.showSuccess,
    showWarning: session.showWarning,
    showError: session.showError
  });

  const timeline = useTimelineState({
    activeTab,
    activeAlbum,
    refreshApp: session.refreshApp,
    clearFeedback: session.clearFeedback,
    showWarning: session.showWarning,
    showError: session.showError
  });

  useEffect(() => {
    const nextPathname = window.location.pathname;
    const nextSearch = window.location.search.replace(/^\?/, "");
    setScenePathname((current) => current === nextPathname ? current : nextPathname);
    setSceneSearch((current) => current === nextSearch ? current : nextSearch);
  }, [pathname, search]);

  useEffect(() => {
    function syncSceneFromLocation() {
      setScenePathname(window.location.pathname);
      setSceneSearch(window.location.search.replace(/^\?/, ""));
    }

    window.addEventListener("popstate", syncSceneFromLocation);
    return () => window.removeEventListener("popstate", syncSceneFromLocation);
  }, []);

  useEffect(() => {
    if (!session.isAuthenticated || session.bootPhase !== "done") {
      return;
    }
    if (albumId && activeAlbum?.album.id !== albumId) {
      void session.refreshApp(albumId, { silent: Boolean(session.appState) });
    }
  }, [activeAlbum?.album.id, albumId, session.appState, session.bootPhase, session.isAuthenticated, session.refreshApp]);

  useEffect(() => {
    if (activeTab !== "settings") {
      requestedScreenKeyRef.current = "";
      settingsRefreshKeyRef.current = "";
      return;
    }
    const routeScreen = requestedScreen ?? "menu";
    const routeMemberId = routeScreen === "memberDetail" ? requestedMemberId : "";
    const key = `${scenePathname}?screen=${routeScreen}&memberId=${routeMemberId}`;
    if (requestedScreenKeyRef.current === key) {
      return;
    }
    const previousKey = requestedScreenKeyRef.current;
    requestedScreenKeyRef.current = key;
    const previousScreen = previousKey ? previousKey.split("?screen=")[1]?.split("&memberId=")[0] as SettingsScreen | undefined : undefined;
    const direction = previousScreen && SETTINGS_SCREEN_DEPTH[routeScreen] < SETTINGS_SCREEN_DEPTH[previousScreen] ? "back" : "forward";
    settings.openSettingsScreen(routeScreen, direction, routeMemberId ? { memberId: routeMemberId } : undefined);
  }, [activeTab, requestedMemberId, requestedScreen, scenePathname, settings]);

  useEffect(() => {
    if (activeTab !== "settings" || !activeAlbum || !session.isAuthenticated || session.bootPhase !== "done") {
      return;
    }
    const routeScreen = requestedScreen ?? "menu";
    const routeMemberId = routeScreen === "memberDetail" ? requestedMemberId : "";
    const key = `${activeAlbum.album.id}:${routeScreen}:${routeMemberId}`;
    if (settingsRefreshKeyRef.current === key) {
      return;
    }
    settingsRefreshKeyRef.current = key;
    void session.refreshApp(activeAlbum.album.id, { silent: true });
  }, [activeAlbum, activeTab, requestedMemberId, requestedScreen, session.bootPhase, session.isAuthenticated, session.refreshApp]);

  const appView = useMemo(() => buildAppShellViewModel({
    activeAlbum,
    currentUser,
    settingsNavDirection: settings.settingsNavDirection,
    storagePairing: settings.storagePairing
  }), [activeAlbum, currentUser, settings.settingsNavDirection, settings.storagePairing]);
  const backgroundUpload = useBackgroundUpload();
  const previousUploadPhaseRef = useRef(backgroundUpload.state.phase);

  const relationLabels = useMemo(() => buildRelationLabels(appView.albumMembers), [appView.albumMembers]);
  const timelineDays = useMemo(() => buildTimelineFeed(timeline.timelineEntries, appView.activeBaby?.birthDate, relationLabels), [appView.activeBaby?.birthDate, relationLabels, timeline.timelineEntries]);
  const readyAlbum = activeAlbum?.album.id === albumId ? activeAlbum : null;
  const redirectPath = resolveAlbumRedirect({
    bootPhaseDone: session.bootPhase === "done",
    inviteCode,
    activeTab,
    requestedAlbumId: albumId,
    activeAlbumId,
    loading: session.loading,
    albumRefreshing
  });

  useEffect(() => {
    if (!session.isAuthenticated || session.bootPhase !== "done") {
      return;
    }
    router.prefetch(buildAlbumPath(albumId, "photos"));
    router.prefetch(buildAlbumPath(albumId, "settings"));
  }, [albumId, router, session.bootPhase, session.isAuthenticated]);

  useEffect(() => {
    if (activeTab !== "photos" || !readyAlbum) {
      if (timeline.lightbox && !timeline.lightboxClosing) {
        timeline.requestCloseLightbox();
      }
      return;
    }

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
      albumId: readyAlbum.album.id,
      batch: matchingBatch,
      index: nextIndex
    });
  }, [activeTab, readyAlbum, requestedLightboxEntryId, requestedLightboxMediaId, timeline, timelineDays]);

  useEffect(() => {
    if (activeTab !== "photos") {
      if (timeline.draftSheetOpen) {
        timeline.closeDraftSheet();
      }
      return;
    }

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
  }, [activeTab, requestedComposer, requestedEditEntryId, timeline, timeline.timelineEntries]);

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
      if (activeTab !== "photos") {
        session.showSuccess("上传完成", "媒体已经上传完成。");
      }
      return;
    }

    if (nextPhase === "error" && activeTab !== "photos") {
      session.showError("上传失败", backgroundUpload.state.errorMessage || "上传失败。");
      backgroundUpload.clear();
    }
  }, [activeTab, backgroundUpload, session, timeline.draftSheetOpen]);

  function navigateAlbumScene(nextPath: string, mode: "push" | "replace" = "push") {
    const nextUrl = new URL(nextPath, window.location.origin);
    if (mode === "replace") {
      window.history.replaceState(null, "", nextUrl);
    } else {
      window.history.pushState(null, "", nextUrl);
    }
    setScenePathname(nextUrl.pathname);
    setSceneSearch(nextUrl.search.replace(/^\?/, ""));
  }

  function handleTabNavigate(nextTab: TabKey) {
    if (!activeAlbum || nextTab === activeTab) {
      return;
    }
    timeline.captureTabScrollPosition(activeTab);
    navigateAlbumScene(buildAlbumPath(activeAlbum.album.id, nextTab));
  }

  function prefetchTab(nextTab: TabKey) {
    router.prefetch(buildAlbumPath(albumId, nextTab));
  }

  function handleAlbumChange(nextAlbumId: string) {
    const currentSettingsScreen = requestedScreen ?? "menu";
    const nextSettingsScreen = currentSettingsScreen === "memberDetail" ? "babyDetail" : currentSettingsScreen;
    timeline.captureTabScrollPosition(activeTab);
    startTransition(() => {
      router.push(buildAlbumPath(nextAlbumId, activeTab, activeTab === "settings" ? { screen: nextSettingsScreen } : undefined));
    });
  }

  async function handleOpenUploadFlow() {
    if (!activeAlbum) {
      return;
    }
    if (backgroundUpload.hasTask) {
      session.showWarning("正在上传", "当前已有上传进行中，完成后再试。");
      return;
    }
    const nextState = await session.refreshApp(activeAlbum.album.id, { silent: true });
    const latestAlbum = nextState?.activeAlbum?.album.id === activeAlbum.album.id ? nextState.activeAlbum : activeAlbum;

    if (!latestAlbum || latestAlbum.album.id !== activeAlbum.album.id) {
      session.showWarning("状态已变化", "当前相册状态已更新，请稍后重试。");
      return;
    }
    if (!latestAlbum.storageNode) {
      session.showWarning("还差一步", "请先去设置里配对储存节点。");
      timeline.captureTabScrollPosition(activeTab);
      navigateAlbumScene(buildAlbumPath(latestAlbum.album.id, "settings", { screen: "storage" }));
      return;
    }
    if (latestAlbum.membership.role === "viewer") {
      session.showWarning("没有权限", "当前身份没有上传权限。");
      return;
    }
    navigateAlbumScene(buildPhotosPath(latestAlbum.album.id, { composer: "new" }));
  }

  async function handleOpenAlbumSettings(nextAlbumId: string) {
    timeline.captureTabScrollPosition(activeTab);
    if (activeAlbum?.album.id === nextAlbumId) {
      navigateAlbumScene(buildAlbumPath(nextAlbumId, "settings", { screen: "babyDetail" }));
      return;
    }
    startTransition(() => {
      router.push(buildAlbumPath(nextAlbumId, "settings", { screen: "babyDetail" }));
    });
  }

  function navigateSettingsScreen(nextScreen: SettingsScreen, direction: "forward" | "back" = "forward", options?: { memberId?: string }) {
    if (!activeAlbum) {
      return;
    }
    const nextPath = buildAlbumPath(activeAlbum.album.id, "settings", {
      screen: nextScreen,
      memberId: nextScreen === "memberDetail" ? options?.memberId ?? null : null
    });
    navigateAlbumScene(nextPath, direction === "back" ? "replace" : "push");
  }

  function handleOpenLightbox(entryId: string, mediaId: string) {
    if (!activeAlbum) {
      return;
    }
    navigateAlbumScene(buildPhotosPath(activeAlbum.album.id, {
      lightboxEntryId: entryId,
      mediaId
    }));
  }

  function handleNavigateLightbox(direction: -1 | 1) {
    if (!activeAlbum || !timeline.lightbox) {
      return;
    }
    const nextItem = timeline.lightbox.batch.items[timeline.lightbox.index + direction];
    if (!nextItem) {
      return;
    }
    navigateAlbumScene(buildPhotosPath(activeAlbum.album.id, {
      lightboxEntryId: timeline.lightbox?.batch.entry.id,
      mediaId: nextItem.id
    }), "replace");
  }

  function handleCloseLightbox() {
    if (!activeAlbum) {
      return;
    }
    navigateAlbumScene(buildPhotosPath(activeAlbum.album.id), "replace");
  }

  function handleOpenEditEntry(entryId: string) {
    if (!activeAlbum) {
      return;
    }
    navigateAlbumScene(buildPhotosPath(activeAlbum.album.id, { editEntryId: entryId }));
  }

  function handleCloseDraftSheet() {
    if (!activeAlbum) {
      return;
    }
    navigateAlbumScene(buildPhotosPath(activeAlbum.album.id), "replace");
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

  function handleLogout() {
    const target = buildAuthPath(inviteCode);
    void session.handleLogout();
    startTransition(() => {
      router.replace(target);
    });
  }

  const showAlbumContent = Boolean(readyAlbum);
  const blocking = Boolean(redirectPath || !showAlbumContent);
  const showUploadFab = activeTab === "photos" && (
    (backgroundUpload.state.phase === "uploading" && backgroundUpload.state.surface === "minimized")
    || backgroundUpload.state.phase === "success"
  );

  return (
    <AppPageFrame activeAlbum={activeAlbum} blocking={blocking} currentUser={currentUser} session={session}>
      {redirectPath ? <RouteRedirect to={redirectPath} /> : null}
      {readyAlbum && !redirectPath ? (
        <AlbumRouteProvider
          value={{
            activeTab,
            session,
            activeAlbum: readyAlbum,
            activeBaby: appView.activeBaby,
            albumOptions,
            currentUser,
            settings,
            timeline,
            appView,
            timelineDays,
            handleAlbumChange,
            handleOpenUploadFlow,
            handleOpenLightbox,
            handleOpenEditEntry,
            handleOpenAlbumSettings,
            navigateSettingsScreen,
            handleLogout
          }}
        >
          <div className="tabViewport">
            <PhotosRoute />
            <SettingsRoute />
          </div>
        </AlbumRouteProvider>
      ) : null}

      {timeline.lightbox ? (
        <LightboxViewer
          key={`${timeline.lightbox.albumId}:${timeline.lightbox.batch.entry.id}`}
          closing={timeline.lightboxClosing}
          lightbox={timeline.lightbox}
          onClose={handleCloseLightbox}
          onNavigate={handleNavigateLightbox}
        />
      ) : null}

      {readyAlbum && !redirectPath ? (
        <UploadDraftSheet
          albumId={readyAlbum.album.id}
          backgroundUpload={backgroundUpload}
          babyName={appView.activeBaby?.name}
          disabled={!appView.canUploadMedia && !timeline.editingEntry}
          disabledReason={!appView.storageNode ? "上传前需要先完成 NAS 配对。" : "当前身份没有上传权限。"}
          editingEntry={timeline.editingEntry}
          onClose={handleCloseDraftSheet}
          onDeleted={() => timeline.refreshTimelineSoon(readyAlbum.album.id)}
          onUploaded={() => timeline.refreshTimelineSoon(readyAlbum.album.id)}
          open={timeline.draftSheetOpen}
        />
      ) : null}

      {readyAlbum && !redirectPath ? (
        <DraftUploadProgressDialog onCloseError={handleCloseUploadError} onMinimize={handleMinimizeUpload} state={backgroundUpload.state} />
      ) : null}

      {readyAlbum && !redirectPath && showUploadFab ? <UploadProgressFab onClick={handleOpenUploadDialog} state={backgroundUpload.state} /> : null}
      {readyAlbum && !redirectPath && activeTab === "photos" && !showUploadFab ? <FloatingAddButton onClick={handleOpenUploadFlow} /> : null}
      {readyAlbum && !redirectPath ? (
        <BottomNav
          activeTab={activeTab}
          hidden={timeline.draftSheetOpen}
          onNavigate={handleTabNavigate}
          onPrefetch={prefetchTab}
          photosHref={buildAlbumPath(readyAlbum.album.id, "photos")}
          settingsHref={buildAlbumPath(readyAlbum.album.id, "settings")}
        />
      ) : null}
    </AppPageFrame>
  );
}
