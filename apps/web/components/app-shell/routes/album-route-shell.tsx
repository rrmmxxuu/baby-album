"use client";

import { startTransition, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UploadDraftSheet } from "../../upload-draft-sheet";
import { AlbumRouteProvider } from "../album-route-context";
import { useAppSessionContext } from "../app-session-provider";
import { useSettingsState } from "../hooks/use-settings-state";
import { useTimelineState } from "../hooks/use-timeline-state";
import { buildRelationLabels, buildTimelineFeed } from "../model/timeline";
import { buildAlbumPath, buildAuthPath, parseSettingsScreen, resolveAlbumRedirect } from "../model/routes";
import { buildAppShellViewModel } from "../model/view";
import type { SettingsScreen, TabKey } from "../model/types";
import { AppPageFrame } from "../ui/app-page-frame";
import { BottomNav } from "../ui/bottom-nav";
import { FloatingAddButton } from "../ui/floating-add-button";
import { LightboxViewer } from "../ui/lightbox-viewer";
import { RouteRedirectNotice } from "./route-redirect-notice";

interface AlbumRouteShellProps {
  albumId: string;
  children: React.ReactNode;
}

function toTab(pathname: string): TabKey {
  return pathname.endsWith("/settings") ? "settings" : "photos";
}

function isRouteScreen(screen: SettingsScreen) {
  return screen !== "menu" && screen !== "memberDetail";
}

export function AlbumRouteShell({ albumId, children }: AlbumRouteShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const requestedScreen = parseSettingsScreen(searchParams.get("screen"));
  const activeTab = toTab(pathname);
  const requestedScreenKeyRef = useRef("");
  const inviteCode = searchParams.get("invite") ?? "";

  const activeAlbum = session.appState?.activeAlbum ?? null;
  const albumOptions = session.appState?.albums ?? [];
  const currentUser = session.appState?.currentUser ?? null;
  const rememberedAlbumId = session.selectedAlbumId;
  const activeAlbumId = activeAlbum?.album.id ?? null;
  const albumRefreshing = Boolean(session.authToken && albumId && activeAlbumId && activeAlbumId !== albumId);

  const settings = useSettingsState({
    activeTab,
    authToken: session.authToken,
    appState: session.appState,
    activeAlbum,
    currentUser,
    refreshApp: session.refreshApp,
    setError: session.setError,
    setNotice: session.setNotice
  });

  const timeline = useTimelineState({
    activeTab,
    authToken: session.authToken,
    activeAlbum,
    currentUser,
    refreshApp: session.refreshApp,
    setError: session.setError
  });

  useEffect(() => {
    if (!session.authToken || session.bootPhase !== "done") {
      return;
    }
    if (albumId && activeAlbum?.album.id !== albumId) {
      void session.refreshApp(albumId, { silent: Boolean(session.appState) });
    }
  }, [activeAlbum?.album.id, albumId, session.appState, session.authToken, session.bootPhase, session.refreshApp]);

  useEffect(() => {
    if (!requestedScreen || activeTab !== "settings") {
      requestedScreenKeyRef.current = "";
      return;
    }
    const key = `${pathname}?screen=${requestedScreen}`;
    if (requestedScreenKeyRef.current === key) {
      return;
    }
    requestedScreenKeyRef.current = key;
    settings.openSettingsScreen(requestedScreen);
  }, [activeTab, pathname, requestedScreen, settings]);

  const appView = useMemo(() => buildAppShellViewModel({
    activeAlbum,
    currentUser,
    settingsNavDirection: settings.settingsNavDirection,
    storagePairing: settings.storagePairing
  }), [activeAlbum, currentUser, settings.settingsNavDirection, settings.storagePairing]);

  const relationLabels = useMemo(() => buildRelationLabels(appView.albumMembers), [appView.albumMembers]);
  const timelineDays = useMemo(() => buildTimelineFeed(timeline.timelineEntries, appView.activeBaby?.birthDate, relationLabels), [appView.activeBaby?.birthDate, relationLabels, timeline.timelineEntries]);
  const readyAlbum = activeAlbum?.album.id === albumId ? activeAlbum : null;
  const redirectPath = resolveAlbumRedirect({
    bootPhaseDone: session.bootPhase === "done",
    authToken: session.authToken,
    inviteCode,
    activeTab,
    requestedAlbumId: albumId,
    activeAlbumId,
    rememberedAlbumId,
    loading: session.loading,
    albumRefreshing
  });

  useEffect(() => {
    if (!readyAlbum) {
      return;
    }
    router.prefetch(buildAlbumPath(readyAlbum.album.id, "photos"));
    router.prefetch(buildAlbumPath(readyAlbum.album.id, "settings"));
  }, [readyAlbum, router]);

  function changeTab(nextTab: TabKey) {
    if (!activeAlbum || nextTab === activeTab) {
      return;
    }
    timeline.captureTabScrollPosition(activeTab);
    startTransition(() => {
      router.push(buildAlbumPath(activeAlbum.album.id, nextTab));
    });
  }

  function handleAlbumChange(nextAlbumId: string) {
    const routeScreen = activeTab === "settings" && isRouteScreen(settings.settingsScreen) ? settings.settingsScreen : requestedScreen;
    timeline.captureTabScrollPosition(activeTab);
    startTransition(() => {
      router.push(buildAlbumPath(nextAlbumId, activeTab, activeTab === "settings" ? { screen: routeScreen } : undefined));
    });
  }

  function handleOpenUploadFlow() {
    if (!activeAlbum) {
      return;
    }
    if (!appView.storageNode) {
      session.setNotice("请先去设置里配对储存节点。");
      timeline.captureTabScrollPosition(activeTab);
      startTransition(() => {
        router.push(buildAlbumPath(activeAlbum.album.id, "settings", { screen: "storage" }));
      });
      return;
    }
    if (activeAlbum.membership.role === "viewer") {
      session.setNotice("当前身份没有上传权限。");
      return;
    }
    timeline.openNewDraftSheet();
  }

  async function handleOpenAlbumSettings(nextAlbumId: string) {
    timeline.captureTabScrollPosition(activeTab);
    startTransition(() => {
      router.push(buildAlbumPath(nextAlbumId, "settings", { screen: "babyDetail" }));
    });
  }

  function handleLogout() {
    const target = buildAuthPath(inviteCode);
    void session.handleLogout();
    startTransition(() => {
      router.replace(target);
    });
  }

  const showAlbumContent = Boolean(readyAlbum);

  return (
    <AppPageFrame activeAlbum={activeAlbum} currentUser={currentUser} session={session}>
      {redirectPath ? <RouteRedirectNotice label="正在同步最新状态..." to={redirectPath} /> : null}

      {readyAlbum && !redirectPath ? (
        <AlbumRouteProvider
          value={{
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
            handleOpenAlbumSettings,
            handleLogout
          }}
        >
          <div className="tabViewport">{children}</div>
        </AlbumRouteProvider>
      ) : null}

      {!redirectPath && (session.loading || !showAlbumContent) ? <p className="helperText loadingRow">正在同步最新状态...</p> : null}

      {timeline.lightbox ? <LightboxViewer authToken={session.authToken} closing={timeline.lightboxClosing} lightbox={timeline.lightbox} onClose={timeline.requestCloseLightbox} onNavigate={timeline.navigateLightbox} /> : null}

      {readyAlbum && !redirectPath ? (
        <UploadDraftSheet
          albumId={readyAlbum.album.id}
          authToken={session.authToken}
          babyName={appView.activeBaby?.name}
          disabled={!appView.canUploadMedia && !timeline.editingEntry}
          disabledReason={!appView.storageNode ? "上传前需要先完成 NAS 配对。" : "当前身份没有上传权限。"}
          editingEntry={timeline.editingEntry}
          onClose={timeline.closeDraftSheet}
          onDeleted={() => timeline.refreshTimelineSoon(readyAlbum.album.id)}
          onUploaded={() => timeline.refreshTimelineSoon(readyAlbum.album.id)}
          open={timeline.draftSheetOpen}
        />
      ) : null}

      {readyAlbum && !redirectPath && activeTab === "photos" ? <FloatingAddButton onClick={handleOpenUploadFlow} /> : null}
      {readyAlbum && !redirectPath ? <BottomNav activeTab={activeTab} hidden={timeline.draftSheetOpen} onChange={changeTab} /> : null}
    </AppPageFrame>
  );
}
