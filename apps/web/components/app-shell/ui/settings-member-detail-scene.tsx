import type { AlbumMember, AlbumWorkspace, User, Role } from "../../../lib/types";
import type { SettingsState } from "../hooks/use-settings-state";
import { memberRelationLabel, roleLabel } from "../model/format";
import { SettingsHeader } from "./settings-header";
import { SettingsSection } from "../../ui/settings-section";

interface SettingsMemberDetailSceneProps {
  className: string;
  activeAlbum: AlbumWorkspace;
  currentUser: User | null;
  albumMembers: AlbumMember[];
  settings: SettingsState;
}

export function SettingsMemberDetailScene({ className, activeAlbum, currentUser, albumMembers, settings }: SettingsMemberDetailSceneProps) {
  return (
    <article className={className}>
      <SettingsHeader eyebrow="成员详情" onBack={() => settings.openSettingsScreen("babyDetail", "back")} title={albumMembers.find((member) => member.userId === settings.settingsMemberId)?.displayName ?? "成员"} />
      {albumMembers.filter((member) => member.userId === settings.settingsMemberId).map((member) => (
        <SettingsSection key={member.userId} title="成员信息">
          <p><strong>{member.displayName}</strong></p>
          <p className="helperText">与宝宝的关系：{memberRelationLabel(member)}</p>
          <p className="helperText">用户 ID：{member.userId}</p>
          <p className="helperText">当前权限：{roleLabel(member.role)}</p>
          {Boolean(activeAlbum.membership.role === "owner" && currentUser && member.userId !== currentUser.id && member.role !== "owner") ? (
            <div className="memberActions">
              <select value={settings.roleDrafts[member.userId] ?? member.role} onChange={(event) => settings.setRoleDraft(member.userId, event.target.value as Role)}>
                <option value="viewer">仅查看</option>
                <option value="member">可上传</option>
                <option value="admin">管理员</option>
              </select>
              <button onClick={() => void settings.handleRoleUpdate(member.userId)} type="button">保存权限</button>
            </div>
          ) : <p className="helperText">只有 owner 可以修改其他亲友权限。</p>}
        </SettingsSection>
      ))}
    </article>
  );
}
