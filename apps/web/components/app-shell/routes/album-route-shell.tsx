"use client";

import { startTransition, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UploadDraftSheet } from "../../upload-draft-sheet";
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
import { RouteRedirectNotice } from "./route-redirect-notice";

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

export function AlbumRouteShell({ albumId, children }: AlbumRouteShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const requestedScreen = parseSettingsScreen(searchParams.get("screen"));
  const requestedMemberId = searchParams.get("memberId") ?? "";
  const requestedLightboxEntryId = searchParams.get("lightbox") ?? "";
  const requestedLightboxMediaId = searchParams.get("media") ?? "";
  const requestedComposer = searchParams.get("composer") ?? "";
  const requestedEditEntryId = searchParams.get("edit") ?? "";
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
    if (activeTab !== "settings") {
      requestedScreenKeyRef.current = "";
      return;
    }
    const routeScreen = requestedScreen ?? "menu";
    const routeMemberId = routeScreen === "memberDetail" ? requestedMemberId : "";
    const key = `${pathname}?screen=${routeScreen}&memberId=${routeMemberId}`;
    if (requestedScreenKeyRef.current === key) {
      return;
    }
    const previousKey = requestedScreenKeyRef.current;
    requestedScreenKeyRef.current = key;
    const previousScreen = previousKey ? previousKey.split("?screen=")[1]?.split("&memberId=")[0] as SettingsScreen | undefined : undefined;
    const direction = previousScreen && SETTINGS_SCREEN_DEPTH[routeScreen] < SETTINGS_SCREEN_DEPTH[previousScreen] ? "back" : "forward";
    settings.openSettingsScreen(routeScreen, direction, routeMemberId ? { memberId: routeMemberId } : undefined);
  }, [activeTab, pathname, requestedMemberId, requestedScreen, settings]);

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
    if (!session.authToken || session.bootPhase !== "done") {
      return;
    }
    router.prefetch(buildAlbumPath(albumId, "photos"));
    router.prefetch(buildAlbumPath(albumId, "settings"));
  }, [albumId, router, session.authToken, session.bootPhase]);

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

  function handleTabNavigate(nextTab: TabKey) {
    if (nextTab !== activeTab) {
      timeline.captureTabScrollPosition(activeTab);
    }
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
    startTransition(() => {
      router.push(buildPhotosPath(activeAlbum.album.id, { composer: "new" }));
    });
  }

  async function handleOpenAlbumSettings(nextAlbumId: string) {
    timeline.captureTabScrollPosition(activeTab);
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
    startTransition(() => {
      if (direction === "back") {
        router.replace(nextPath);
        return;
      }
      router.push(nextPath);
    });
  }

  function handleOpenLightbox(entryId: string, mediaId: string) {
    if (!activeAlbum) {
      return;
    }
    startTransition(() => {
      router.push(buildPhotosPath(activeAlbum.album.id, {
        lightboxEntryId: entryId,
        mediaId
      }));
    });
  }

  function handleNavigateLightbox(direction: -1 | 1) {
    if (!activeAlbum || !timeline.lightbox) {
      return;
    }
    const nextItem = timeline.lightbox.batch.items[timeline.lightbox.index + direction];
    if (!nextItem) {
      return;
    }
    startTransition(() => {
      router.replace(buildPhotosPath(activeAlbum.album.id, {
        lightboxEntryId: timeline.lightbox?.batch.entry.id,
        mediaId: nextItem.id
      }));
    });
  }

  function handleCloseLightbox() {
    if (!activeAlbum) {
      return;
    }
    startTransition(() => {
      router.replace(buildPhotosPath(activeAlbum.album.id));
    });
  }

  function handleOpenEditEntry(entryId: string) {
    if (!activeAlbum) {
      return;
    }
    startTransition(() => {
      router.push(buildPhotosPath(activeAlbum.album.id, { editEntryId: entryId }));
    });
  }

  function handleCloseDraftSheet() {
    if (!activeAlbum) {
      return;
    }
    startTransition(() => {
      router.replace(buildPhotosPath(activeAlbum.album.id));
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
            handleOpenLightbox,
            handleOpenEditEntry,
            handleOpenAlbumSettings,
            navigateSettingsScreen,
            handleLogout
          }}
        >
          <div className="tabViewport">{children}</div>
        </AlbumRouteProvider>
      ) : null}

      {!redirectPath && (session.loading || !showAlbumContent) ? <p className="helperText loadingRow">正在同步最新状态...</p> : null}

      {timeline.lightbox ? <LightboxViewer authToken={session.authToken} closing={timeline.lightboxClosing} lightbox={timeline.lightbox} onClose={handleCloseLightbox} onNavigate={handleNavigateLightbox} /> : null}

      {readyAlbum && !redirectPath ? (
        <UploadDraftSheet
          albumId={readyAlbum.album.id}
          authToken={session.authToken}
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

      {readyAlbum && !redirectPath && activeTab === "photos" ? <FloatingAddButton onClick={handleOpenUploadFlow} /> : null}
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
