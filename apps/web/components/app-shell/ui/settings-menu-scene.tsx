import type { AlbumWorkspace, BabyProfile, User } from "../../../lib/types";
import type { StorageStatus } from "../model/types";
import { memberRelationLabel, roleLabel } from "../model/format";
import { SettingsMenuItem } from "../../ui/settings-menu-item";
import { StorageStatusChip } from "../../ui/storage-status-chip";

interface SettingsMenuSceneProps {
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  currentUser: User | null;
  navDirection: "forward" | "back";
  storageStatus: StorageStatus;
  storageStatusSummary: string;
  onOpenScreen: (screen: "account" | "babies" | "storage") => void;
  onLogout: () => void;
}

export function SettingsMenuScene({ activeAlbum, activeBaby, currentUser, navDirection, storageStatus, storageStatusSummary, onOpenScreen, onLogout }: SettingsMenuSceneProps) {
  return (
    <div className={`settingsScene settingsRootScene ${navDirection === "back" ? "settingsRootSceneBack" : "settingsRootSceneForward"}`}>
      <article className="settingsHero panel">
        <div className="settingsHeroBackdrop" />
        <div className="settingsHeroBody">
          <div className="settingsHeroCopy">
            <p className="eyebrow">设置</p>
            <h2>管理账号、宝宝和储存节点</h2>
            <p className="helperText">当前正在查看 {activeBaby?.name ?? activeAlbum.album.name} 的相册空间。</p>
          </div>
          <div className="sessionBadge settingsSessionBadge">
            <strong>{currentUser?.displayName}</strong>
            <span>{currentUser?.email}</span>
            <span>{memberRelationLabel(activeAlbum.membership)} · {roleLabel(activeAlbum.membership.role)}</span>
          </div>
        </div>
      </article>

      <article className="settingsMenu">
        <SettingsMenuItem onClick={() => onOpenScreen("account")} primary="账户管理" secondary="查看当前登录账号和你在相册中的身份" />
        <SettingsMenuItem onClick={() => onOpenScreen("babies")} primary="宝宝管理" secondary="切换、编辑或新增宝宝相册" />
        <SettingsMenuItem onClick={() => onOpenScreen("storage")} primary="储存节点管理" secondary={storageStatusSummary} trailing={<StorageStatusChip status={storageStatus} />} />
        <SettingsMenuItem danger onClick={onLogout} primary="退出登录" secondary="清除当前设备上的登录状态" />
      </article>
    </div>
  );
}
