"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBabyRouteContext } from "../baby-route-context";
import { buildBabyManagePath } from "../model/routes";
import { useWorkspaceScrollReset } from "../workspace-viewport";
import { SettingsStorageScene } from "../ui/settings-storage-scene";

export function BabyStorageRoute() {
  const router = useRouter();
  const { babyId, workspace, appView, settings, session } = useBabyRouteContext();
  const refreshApp = session.refreshApp;

  useWorkspaceScrollReset();

  useEffect(() => {
    if (!session.isAuthenticated) {
      return;
    }
    void refreshApp(workspace.album.id, { silent: true });
  }, [refreshApp, session.isAuthenticated, workspace.album.id]);

  return (
    <SettingsStorageScene
      activeAlbum={workspace}
      activeBaby={appView.activeBaby}
      activeStoragePairing={appView.activeStoragePairing}
      canManageStorage={appView.canManageStorage}
      className="panelStack settingsDetailPage settingsScene settingsSceneForward"
      onBack={() => router.push(buildBabyManagePath(babyId))}
      onCreateStoragePairing={settings.handleCreateStoragePairing}
      storageFlowTitle={appView.storageFlowTitle}
      storageNode={appView.storageNode}
      storagePairingActionLabel={appView.storagePairingActionLabel}
      storagePairingModeLabel={appView.storagePairingModeLabel}
      storageStatus={appView.storageStatus}
      storageStatusSummary={appView.storageStatusSummary}
      storageUploadSummary={appView.storageUploadSummary}
    />
  );
}
