import type { AlbumInvite } from "../../../lib/types";
import { inviteStatusLabel, roleLabel } from "../model/format";

interface InviteCardProps {
  invite: AlbumInvite;
  mode: "preview" | "accept" | "code";
  origin: string;
}

export function InviteCard({ invite, mode, origin }: InviteCardProps) {
  const inviteLink = origin ? `${origin}/?invite=${invite.code}` : `/?invite=${invite.code}`;
  return (
    <div className="inviteCard">
      <strong>{invite.albumName ?? "宝宝相册邀请"}</strong>
      <p className="helperText">权限：{roleLabel(invite.role)} / 状态：{inviteStatusLabel(invite.status)}</p>
      {invite.createdByName ? <p className="helperText">创建人：{invite.createdByName}</p> : null}
      {invite.expiresAt ? <p className="helperText">有效期至：{new Date(invite.expiresAt).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" })}</p> : null}
      {mode === "accept" ? <p className="inviteLink">{inviteLink}</p> : null}
      {mode === "code" ? <p className="inviteLink">{invite.code}</p> : null}
      {mode === "preview" ? <p className="helperText">登录后即可用这个邀请码加入对应的宝宝相册。</p> : null}
    </div>
  );
}
