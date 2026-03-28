"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UploadDraftSheet } from "./upload-draft-sheet";
import { useAppSession } from "./app-shell/hooks/use-app-session";
import { useSettingsState } from "./app-shell/hooks/use-settings-state";
import { useTimelineState } from "./app-shell/hooks/use-timeline-state";
import { buildRelationLabels, buildTimelineFeed } from "./app-shell/model/timeline";
import { buildAppShellViewModel } from "./app-shell/model/view";
import type { TabKey } from "./app-shell/model/types";
import { BootSplash } from "./app-shell/ui/boot-splash";
import { BottomNav } from "./app-shell/ui/bottom-nav";
import { FloatingAddButton } from "./app-shell/ui/floating-add-button";
import { AuthScreen } from "./app-shell/ui/auth-screen";
import { LightboxViewer } from "./app-shell/ui/lightbox-viewer";
import { NoAlbumScreen } from "./app-shell/ui/no-album-screen";
import { PhotosTab } from "./app-shell/ui/photos-tab";
import { SettingsTab } from "./app-shell/ui/settings-tab";
import { TopBar } from "./app-shell/ui/top-bar";

function AppShellInner() {
  const searchParams = useSearchParams();
  const queryInviteCode = searchParams.get("invite") ?? "";
  const [activeTab, setActiveTab] = useState<TabKey>("photos");
  const session = useAppSession(queryInviteCode);

  const activeAlbum = session.appState?.activeAlbum ?? null;
  const albumOptions = session.appState?.albums ?? [];
  const currentUser = session.appState?.currentUser ?? null;

  useEffect(() => {
    if (!activeAlbum) {
      setActiveTab("photos");
    }
  }, [activeAlbum]);

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

  const appView = useMemo(() => buildAppShellViewModel({
    activeAlbum,
    currentUser,
    settingsNavDirection: settings.settingsNavDirection,
    storagePairing: settings.storagePairing
  }), [activeAlbum, currentUser, settings.settingsNavDirection, settings.storagePairing]);

  const activeBaby = appView.activeBaby;
  const albumMembers = appView.albumMembers;
  const relationLabels = useMemo(() => buildRelationLabels(albumMembers), [albumMembers]);
  const timelineDays = useMemo(() => buildTimelineFeed(timeline.timelineEntries, activeBaby?.birthDate, relationLabels), [timeline.timelineEntries, activeBaby?.birthDate, relationLabels]);
  const albumInvites = appView.albumInvites;
  const storageNode = appView.storageNode;

  function switchTab(nextTab: TabKey) {
    timeline.captureTabScrollPosition(activeTab);
    setActiveTab(nextTab);
  }

  function handleOpenUploadFlow() {
    if (!activeAlbum) {
      return;
    }
    if (!storageNode) {
      session.setNotice("请先去设置里配对储存节点。");
      setActiveTab("settings");
      settings.openSettingsScreen("storage");
      return;
    }
    if (activeAlbum.membership.role === "viewer") {
      session.setNotice("当前身份没有上传权限。");
      return;
    }
    timeline.openNewDraftSheet();
  }

  return (
    <main className={`appShell${session.authToken && activeAlbum ? " appShellAuthenticated" : ""}${session.bootPhase !== "done" ? " appShellBooting" : ""}`}>
      {session.bootPhase !== "done" ? <BootSplash phase={session.bootPhase === "exiting" ? "exiting" : "loading"} /> : null}

      {!session.authToken || !activeAlbum ? <TopBar currentUser={currentUser} /> : null}

      {session.notice ? <p className="noticeBanner">{session.notice}</p> : null}
      {session.error ? <p className="errorBanner">{session.error}</p> : null}

      {!session.authToken ? <AuthScreen session={session} /> : null}
      {session.authToken && !activeAlbum && !session.loading ? <NoAlbumScreen session={session} /> : null}

      {session.authToken && activeAlbum ? (
        <>
          <div className="tabViewport">
            <PhotosTab
              activeAlbum={activeAlbum}
              activeBaby={activeBaby}
              activeTab={activeTab === "photos"}
              albumOptions={albumOptions}
              authToken={session.authToken}
              currentUserId={currentUser?.id}
              onAlbumChange={(albumId) => void session.refreshApp(albumId)}
              timeline={timeline}
              timelineDays={timelineDays}
            />
            <SettingsTab
              activeAlbum={activeAlbum}
              activeBaby={activeBaby}
              activeStoragePairing={appView.activeStoragePairing}
              activeTab={activeTab === "settings"}
              albumInvites={albumInvites}
              albumMembers={albumMembers}
              albumOptions={albumOptions}
              authToken={session.authToken}
              canManageBabyProfile={appView.canManageBabyProfile}
              canManageInvites={appView.canManageInvites}
              canManageStorage={appView.canManageStorage}
              currentUser={currentUser}
              session={session}
              settings={settings}
              settingsSceneClassName={appView.settingsSceneClassName}
              storageFlowTitle={appView.storageFlowTitle}
              storageNode={storageNode}
              storagePairingActionLabel={appView.storagePairingActionLabel}
              storagePairingModeLabel={appView.storagePairingModeLabel}
              storageStatus={appView.storageStatus}
              storageStatusSummary={appView.storageStatusSummary}
              storageUploadSummary={appView.storageUploadSummary}
              transferCandidates={appView.transferCandidates}
            />
          </div>
        </>
      ) : null}

      {session.loading ? <p className="helperText loadingRow">正在同步最新状态...</p> : null}

      {timeline.lightbox ? <LightboxViewer authToken={session.authToken} closing={timeline.lightboxClosing} lightbox={timeline.lightbox} onClose={timeline.requestCloseLightbox} onNavigate={timeline.navigateLightbox} /> : null}
      {session.authToken && activeAlbum ? (
        <UploadDraftSheet
          albumId={activeAlbum.album.id}
          authToken={session.authToken}
          babyName={activeBaby?.name}
          disabled={!appView.canUploadMedia && !timeline.editingEntry}
          disabledReason={!storageNode ? "上传前需要先完成 NAS 配对。" : "当前身份没有上传权限。"}
          editingEntry={timeline.editingEntry}
          onClose={timeline.closeDraftSheet}
          onDeleted={() => timeline.refreshTimelineSoon(activeAlbum.album.id)}
          onUploaded={() => timeline.refreshTimelineSoon(activeAlbum.album.id)}
          open={timeline.draftSheetOpen}
        />
      ) : null}

      {session.authToken && activeAlbum && activeTab === "photos" ? (
        <FloatingAddButton onClick={handleOpenUploadFlow} />
      ) : null}

      {session.authToken && activeAlbum ? (
        <BottomNav activeTab={activeTab} hidden={timeline.draftSheetOpen} onChange={switchTab} />
      ) : null}
    </main>
  );
}

export function AppShell() {
  return (
    <Suspense fallback={<main className="appShell"><section className="panel"><p className="helperText">正在加载宝宝相册...</p></section></main>}>
      <AppShellInner />
    </Suspense>
  );
}
