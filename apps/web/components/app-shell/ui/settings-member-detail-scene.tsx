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
  onBack: () => void;
  onRemoveMember: (memberId: string) => void;
  memberId?: string;
}

export function SettingsMemberDetailScene({ className, activeAlbum, currentUser, albumMembers, settings, onBack, onRemoveMember, memberId }: SettingsMemberDetailSceneProps) {
  const activeMemberId = memberId ?? settings.settingsMemberId;

  function handleRemove(memberUserId: string) {
    if (typeof window !== "undefined" && !window.confirm("确认移除这个成员吗？被移除后对方将无法继续访问这个宝宝空间。")) {
      return;
    }
    onRemoveMember(memberUserId);
  }

  return (
    <article className={className}>
      <SettingsHeader eyebrow="成员详情" onBack={onBack} title={albumMembers.find((member) => member.userId === activeMemberId)?.displayName ?? "成员"} />
      {albumMembers.filter((member) => member.userId === activeMemberId).map((member) => (
        <SettingsSection key={member.userId} title="成员信息">
          <p><strong>{member.displayName}</strong></p>
          <p className="helperText">与宝宝的关系：{memberRelationLabel(member)}</p>
          <p className="helperText">用户 ID：{member.userId}</p>
          <p className="helperText">当前权限：{roleLabel(member.role)}</p>
          {Boolean(activeAlbum.membership.role === "owner" && currentUser && member.userId !== currentUser.id && member.role !== "owner") ? (
            <div className="memberActions">
              <select value={settings.roleDrafts[member.userId] ?? member.role} onChange={(event) => settings.setRoleDraft(member.userId, event.target.value as Role)}>
                <option value="viewer">仅查看</option>
                <option value="member">成员</option>
                <option value="admin">管理员</option>
              </select>
              <button onClick={() => void settings.handleRoleUpdate(member.userId)} type="button">保存权限</button>
              <button className="settingsMemberDangerAction" onClick={() => handleRemove(member.userId)} type="button">移除成员</button>
            </div>
          ) : <p className="helperText">只有创建者可以修改其他亲友权限。</p>}
        </SettingsSection>
      ))}
    </article>
  );
}
