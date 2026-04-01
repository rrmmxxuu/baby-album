"use client";

import { useRouter } from "next/navigation";
import { useBabyRouteContext } from "../baby-route-context";
import { buildBabyManagePath } from "../model/routes";
import { SettingsStorageScene } from "../ui/settings-storage-scene";

export function BabyStorageRoute() {
  const router = useRouter();
  const { babyId, workspace, appView, settings } = useBabyRouteContext();

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
