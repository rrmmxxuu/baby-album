import type { AlbumWorkspace, BabyProfile, StorageNode, StorageNodePairing } from "../../../lib/types";
import type { StorageStatus } from "../model/types";
import { SettingsHeader } from "./settings-header";
import { StorageFlowSection } from "./storage-flow-section";
import { StorageNodeSection } from "./storage-node-section";
import { StorageOverviewCard } from "./storage-overview-card";
import { StoragePairingSection } from "./storage-pairing-section";

interface SettingsStorageSceneProps {
  className: string;
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  storageNode: StorageNode | null;
  storageStatus: StorageStatus;
  storageStatusSummary: string;
  storageUploadSummary: string;
  storageFlowTitle: string;
  storagePairingModeLabel: string;
  storagePairingActionLabel: string;
  activeStoragePairing: StorageNodePairing | null;
  canManageStorage: boolean;
  onBack: () => void;
  onCreateStoragePairing: () => void | Promise<void>;
}

export function SettingsStorageScene({ className, activeAlbum, activeBaby, storageNode, storageStatus, storageStatusSummary, storageUploadSummary, storageFlowTitle, storagePairingModeLabel, storagePairingActionLabel, activeStoragePairing, canManageStorage, onBack, onCreateStoragePairing }: SettingsStorageSceneProps) {
  return (
    <article className={className}>
      <SettingsHeader eyebrow="储存节点管理" onBack={onBack} title="相册储存" />
      <StorageOverviewCard
        activeAlbum={activeAlbum}
        activeBaby={activeBaby}
        storageNode={storageNode}
        storageStatus={storageStatus}
        storageStatusSummary={storageStatusSummary}
        storageUploadSummary={storageUploadSummary}
      />
      <StorageFlowSection
        activeStoragePairing={activeStoragePairing}
        canManageStorage={canManageStorage}
        onCreateStoragePairing={onCreateStoragePairing}
        storageFlowTitle={storageFlowTitle}
        storageNode={storageNode}
        storagePairingActionLabel={storagePairingActionLabel}
        storagePairingModeLabel={storagePairingModeLabel}
      />
      <StorageNodeSection storageNode={storageNode} />
      <StoragePairingSection
        activeStoragePairing={activeStoragePairing}
        canManageStorage={canManageStorage}
        onCreateStoragePairing={onCreateStoragePairing}
        storageNode={storageNode}
        storagePairingActionLabel={storagePairingActionLabel}
        storagePairingModeLabel={storagePairingModeLabel}
      />
    </article>
  );
}
