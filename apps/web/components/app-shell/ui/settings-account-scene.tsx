import type { AlbumWorkspace, BabyProfile, User } from "../../../lib/types";
import { babyAvatarText, memberRelationLabel, roleLabel } from "../model/format";
import { SettingsHeader } from "./settings-header";
import { SettingsInfoRow } from "../../ui/settings-info-row";
import { SettingsSection } from "../../ui/settings-section";

interface SettingsAccountSceneProps {
  className: string;
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  currentUser: User | null;
  onBack: () => void;
}

export function SettingsAccountScene({ className, activeAlbum, activeBaby, currentUser, onBack }: SettingsAccountSceneProps) {
  return (
    <article className={className}>
      <SettingsHeader eyebrow="账户管理" onBack={onBack} title="账户信息" />
      <SettingsSection title="账户概览">
        <div className="settingsIdentityRow">
          <span aria-hidden="true" className="settingsCardAvatar settingsIdentityAvatar">{babyAvatarText(currentUser?.displayName)}</span>
          <div className="settingsIdentityBody">
            <strong>{currentUser?.displayName}</strong>
            <p className="helperText">{currentUser?.email}</p>
          </div>
        </div>
        <div className="settingsInfoList">
          <SettingsInfoRow label="当前宝宝" value={activeBaby?.name ?? activeAlbum.album.name} />
          <SettingsInfoRow label="关系称呼" value={memberRelationLabel(activeAlbum.membership)} />
          <SettingsInfoRow label="当前权限" value={roleLabel(activeAlbum.membership.role)} />
        </div>
      </SettingsSection>
    </article>
  );
}
