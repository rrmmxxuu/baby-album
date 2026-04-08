import type { StorageNode, StorageNodePairing } from "../../../lib/types";
import { formatDateTime } from "../model/format";
import { StorageSection } from "../../ui/storage-section";

interface StoragePairingSectionProps {
  storageNode: StorageNode | null;
  activeStoragePairing: StorageNodePairing | null;
  canManageStorage: boolean;
  storagePairingActionLabel: string;
  storagePairingModeLabel: string;
  onCreateStoragePairing: () => void | Promise<void>;
}

export function StoragePairingSection({ storageNode, activeStoragePairing, canManageStorage, storagePairingActionLabel, storagePairingModeLabel, onCreateStoragePairing }: StoragePairingSectionProps) {
  return (
    <StorageSection action={canManageStorage ? <button className="secondaryButton" onClick={() => void onCreateStoragePairing()} type="button">{activeStoragePairing ? "重新生成" : storagePairingActionLabel}</button> : null} subtitle={activeStoragePairing ? "等待设备接入" : "暂无待使用配对码"} title="当前配对码">
      {activeStoragePairing ? (
        <div className="storagePairingCard">
          <div className="storagePairingMeta">
            <span className="settingsStatusChip settingsStatusChipPending">{storagePairingModeLabel}</span>
            <p className="helperText">有效期至 {formatDateTime(activeStoragePairing.expiresAt)}</p>
          </div>
          <p className="inviteLink">{activeStoragePairing.code}</p>
          <div className="storageInfoList">
            <p className="storageInfoItem">在储存设备的 agent 配对步骤中输入这 12 位配对码即可完成接入。</p>
            <p className="storageInfoItem">{storageNode ? "新设备接入成功后会切换成当前主节点，旧节点上的已完成媒体会在后台自动补齐到新主节点。" : "首次接入成功后，上传入口会自动恢复可用。"}</p>
          </div>
        </div>
      ) : (
        <p className="helperText">{canManageStorage ? "需要时再生成一个配对码即可。新的配对码适用于当前相册，10 分钟后自动失效。" : "当前没有待使用配对码。若要接入或更换设备，请联系创建者生成。"}</p>
      )}
    </StorageSection>
  );
}
