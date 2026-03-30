"use client";

import { useAlbumRouteContext } from "../album-route-context";
import { SettingsTab } from "../ui/settings-tab";

export function SettingsRoute() {
  const { activeAlbum, activeBaby, activeTab, albumOptions, currentUser, session, settings, appView, handleAlbumChange, handleOpenAlbumSettings, navigateSettingsScreen, handleLogout } = useAlbumRouteContext();

  return (
    <SettingsTab
      activeAlbum={activeAlbum}
      activeBaby={activeBaby}
      activeStoragePairing={appView.activeStoragePairing}
      activeTab={activeTab === "settings"}
      albumInvites={appView.albumInvites}
      albumMembers={appView.albumMembers}
      albumOptions={albumOptions}
      canManageBabyProfile={appView.canManageBabyProfile}
      canManageInvites={appView.canManageInvites}
      canManageStorage={appView.canManageStorage}
      currentUser={currentUser}
      onAlbumChange={handleAlbumChange}
      onLogout={handleLogout}
      onNavigateSettings={navigateSettingsScreen}
      onOpenAlbumSettings={handleOpenAlbumSettings}
      session={session}
      settings={settings}
      settingsSceneClassName={appView.settingsSceneClassName}
      storageFlowTitle={appView.storageFlowTitle}
      storageNode={appView.storageNode}
      storagePairingActionLabel={appView.storagePairingActionLabel}
      storagePairingModeLabel={appView.storagePairingModeLabel}
      storageStatus={appView.storageStatus}
      storageStatusSummary={appView.storageStatusSummary}
      storageUploadSummary={appView.storageUploadSummary}
      transferCandidates={appView.transferCandidates}
    />
  );
}
