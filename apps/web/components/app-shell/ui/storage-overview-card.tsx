import type { AlbumSummary, AlbumWorkspace, BabyProfile, StorageNode } from "../../../lib/types";
import type { StorageStatus } from "../model/types";
import { SettingsInfoRow } from "../../ui/settings-info-row";
import { StorageStatusChip } from "../../ui/storage-status-chip";

interface StorageOverviewCardProps {
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  albumOptions: AlbumSummary[];
  storageNode: StorageNode | null;
  storageStatus: StorageStatus;
  storageStatusSummary: string;
  storageUploadSummary: string;
  onAlbumChange: (albumId: string) => void;
}

export function StorageOverviewCard({ activeAlbum, activeBaby, albumOptions, storageNode, storageStatus, storageStatusSummary, storageUploadSummary, onAlbumChange }: StorageOverviewCardProps) {
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
        <div className="settingsInfoRow">
          <span className="helperText">切换相册</span>
          <label className="storageAlbumPicker">
            <select value={activeAlbum.album.id} onChange={(event) => onAlbumChange(event.target.value)}>
              {albumOptions.map((item) => (
                <option key={item.album.id} value={item.album.id}>{item.baby?.name ?? item.album.name}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </article>
  );
}
