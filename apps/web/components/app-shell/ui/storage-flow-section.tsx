import type { StorageNode, StorageNodePairing } from "../../../lib/types";
import { StorageSection } from "../../ui/storage-section";
import { StorageStepCard } from "./storage-step-card";

interface StorageFlowSectionProps {
  storageNode: StorageNode | null;
  activeStoragePairing: StorageNodePairing | null;
  canManageStorage: boolean;
  storageFlowTitle: string;
  storagePairingActionLabel: string;
  storagePairingModeLabel: string;
  onCreateStoragePairing: () => void | Promise<void>;
}

export function StorageFlowSection({ storageNode, activeStoragePairing, canManageStorage, storageFlowTitle, storagePairingActionLabel, storagePairingModeLabel, onCreateStoragePairing }: StorageFlowSectionProps) {
  return (
    <StorageSection action={canManageStorage ? <button onClick={() => void onCreateStoragePairing()} type="button">{storagePairingActionLabel}</button> : null} subtitle={storageFlowTitle} title="使用流程">
      <div className="storageStepList">
        <StorageStepCard
          description={canManageStorage ? `创建者生成 8 位短码，用于${storagePairingModeLabel}。` : "由相册创建者生成 8 位短码后再继续。"}
          index={1}
          state={activeStoragePairing ? "active" : storageNode ? "done" : "current"}
          title={storagePairingActionLabel}
        />
        <StorageStepCard
          description={storageNode ? "让新设备使用这个短码接入；接入成功后它会成为当前主节点。" : "在 NAS 或小主机上启动 agent，并输入这个短码完成首次接入。"}
          index={2}
          state={activeStoragePairing ? "current" : storageNode ? "done" : undefined}
          title="在设备上完成配对"
        />
        <StorageStepCard
          description={storageNode ? "节点在线后，新上传会继续进入处理队列；替换主节点时，历史媒体会在后台自动补齐。" : "节点上线后，这个相册里的照片和视频上传入口会自动解锁。"}
          index={3}
          state={storageNode ? "current" : undefined}
          title={storageNode ? "等待媒体继续处理" : "开始上传媒体"}
        />
      </div>
      {!canManageStorage ? <p className="helperText">你可以查看当前储存状态，但只有创建者可以生成配对码或替换主节点。</p> : null}
    </StorageSection>
  );
}
