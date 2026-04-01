import type { AlbumWorkspace, BabyProfile, StorageNode } from "../../../lib/types";
import type { StorageStatus } from "../model/types";
import { SettingsInfoRow } from "../../ui/settings-info-row";
import { StorageStatusChip } from "../../ui/storage-status-chip";

interface StorageOverviewCardProps {
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  storageNode: StorageNode | null;
  storageStatus: StorageStatus;
  storageStatusSummary: string;
  storageUploadSummary: string;
}

export function StorageOverviewCard({ activeAlbum, activeBaby, storageNode, storageStatus, storageStatusSummary, storageUploadSummary }: StorageOverviewCardProps) {
  return (
    <article className="panel storageFlowHero">
      <div className="storageFlowHeroTop">
        <div className="storageFlowHeroCopy">
          <p className="settingsCardTitle">当前相册</p>
          <h3>{activeBaby?.name ?? activeAlbum.album.name}</h3>
          <p className="helperText">{storageStatusSummary}</p>
        </div>
        <StorageStatusChip large status={storageStatus} />
      </div>
      <div className="settingsInfoList storageFlowSummary">
        <SettingsInfoRow label="上传处理" value={storageUploadSummary} />
        <SettingsInfoRow label="当前主节点" value={storageNode ? storageNode.name : "尚未绑定"} />
        <SettingsInfoRow label="当前宝宝" value={activeBaby?.name ?? activeAlbum.album.name} />
      </div>
    </article>
  );
}
