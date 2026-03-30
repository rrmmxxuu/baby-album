import type { AlbumInvite, AlbumMember, AlbumWorkspace, BabyProfile, User } from "../../../lib/types";
import type { AppSessionState } from "../hooks/use-app-session";
import type { SettingsState } from "../hooks/use-settings-state";
import { babyAvatarText, memberRelationLabel, roleLabel } from "../model/format";
import { BabyAvatar } from "./baby-avatar";
import { DateField } from "./date-field";
import { InviteCard } from "./invite-card";
import { RelationInput } from "./relation-input";
import { SettingsHeader } from "./settings-header";
import { SettingsListButton } from "../../ui/settings-list-button";
import { SettingsSection } from "../../ui/settings-section";

interface SettingsBabyDetailSceneProps {
  className: string;
  activeAlbum: AlbumWorkspace;
  activeBaby: BabyProfile | null;
  currentUser: User | null;
  albumMembers: AlbumMember[];
  albumInvites: AlbumInvite[];
  transferCandidates: AlbumMember[];
  canManageBabyProfile: boolean;
  canManageInvites: boolean;
  session: AppSessionState;
  settings: SettingsState;
  onBack: () => void;
  onOpenMemberDetail: (memberId: string) => void;
}

export function SettingsBabyDetailScene({ className, activeAlbum, activeBaby, currentUser, albumMembers, albumInvites, transferCandidates, canManageBabyProfile, canManageInvites, session, settings, onBack, onOpenMemberDetail }: SettingsBabyDetailSceneProps) {
  return (
    <article className={className}>
      <SettingsHeader eyebrow="宝宝管理" onBack={onBack} title={activeBaby?.name ?? activeAlbum.album.name} />
      <SettingsSection title="我的角色">
        <form className="formGrid" onSubmit={settings.handleUpdateMyRelation}>
          <RelationInput label="你与宝宝的关系" listId="my-relation" onChange={settings.setMyRelationDraft} placeholder="例如：妈妈" value={settings.myRelationDraft} />
          <button type="submit">保存称呼</button>
        </form>
      </SettingsSection>
      {activeBaby ? (
        <form className="formGrid panelStack panel" onSubmit={settings.handleUpdateBabyProfile}>
          <p className="settingsCardTitle">修改宝宝信息</p>
          <div className="babyProfileAvatarRow">
            <BabyAvatar albumId={activeAlbum.album.id} baby={activeBaby} className="settingsCardAvatar settingsCardAvatarLarge" previewFile={settings.babyAvatarFile} token={session.authToken} />
            <label className="avatarUploadField">
              更换头像
              <input accept="image/*" disabled={!canManageBabyProfile} onChange={(event) => settings.setBabyAvatarFile(event.target.files?.[0] ?? null)} type="file" />
            </label>
          </div>
          <label>宝宝姓名<input disabled={!canManageBabyProfile} value={settings.babyProfileName} onChange={(event) => settings.setBabyProfileName(event.target.value)} /></label>
          <DateField disabled={!canManageBabyProfile} label="出生日期" onChange={settings.setBabyProfileBirthDate} value={settings.babyProfileBirthDate} />
          {canManageBabyProfile ? <button type="submit">保存宝宝信息</button> : <p className="helperText">只有管理员或 owner 可以修改宝宝信息。</p>}
        </form>
      ) : null}
      <SettingsSection title="管理亲友">
        <div className="stackList">
          {albumMembers.map((member) => (
            <SettingsListButton
              className="settingsMemberCard"
              key={member.userId}
              leading={<span className="settingsCardAvatar" aria-hidden="true">{babyAvatarText(member.displayName)}</span>}
              onClick={() => onOpenMemberDetail(member.userId)}
              primary={member.displayName}
              secondary={memberRelationLabel(member)}
            />
          ))}
        </div>
      </SettingsSection>
      <SettingsSection title="邀请码">
        {canManageInvites ? (
          <>
            <form className="inlineForm" onSubmit={settings.handleCreateInvite}>
              <button type="submit">生成邀请码</button>
            </form>
            <p className="helperText">邀请码默认让对方以最低可用权限加入。</p>
            <div className="stackList">
              {albumInvites.map((item) => <InviteCard invite={item} key={item.id} mode="code" origin={session.origin} />)}
            </div>
          </>
        ) : <p className="helperText">只有管理员或 owner 可以生成邀请码。</p>}
      </SettingsSection>
      <SettingsSection title="删除宝宝">
        {activeAlbum.membership.role === "owner" ? (
          transferCandidates.length > 0 ? (
            <>
              <label>
                选择新的 owner
                <select value={settings.ownerTransferTarget} onChange={(event) => settings.setOwnerTransferTarget(event.target.value)}>
                  <option value="">请选择成员</option>
                  {transferCandidates.map((member) => <option key={member.userId} value={member.userId}>{member.displayName} / {roleLabel(member.role)}</option>)}
                </select>
              </label>
              <button onClick={() => void settings.handleLeaveAlbum()} type="button">转让并退出</button>
            </>
          ) : <p className="helperText">当前没有其他成员，owner 暂时不能退出。</p>
        ) : <button className="secondaryButton" onClick={() => void settings.handleLeaveAlbum()} type="button">退出当前宝宝</button>}
      </SettingsSection>
    </article>
  );
}
