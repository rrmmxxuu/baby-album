import type { AppSessionState } from "../hooks/use-app-session";
import { InviteCard } from "./invite-card";
import { RelationInput } from "./relation-input";

interface JoinAlbumFormProps {
  session: AppSessionState;
  title?: string;
  showInvitePreview?: boolean;
  buttonLabel: string;
  relationListId: string;
}

export function JoinAlbumForm({ session, title, showInvitePreview, buttonLabel, relationListId }: JoinAlbumFormProps) {
  return (
    <>
      {title ? <p className="settingsCardTitle">{title}</p> : null}
      <label>
        邀请码
        <input value={session.inviteCodeInput} onChange={(event) => session.setInviteCodeInput(event.target.value)} placeholder="请输入邀请码" />
      </label>
      <RelationInput label="你与宝宝的关系" listId={relationListId} onChange={session.setInviteRelation} placeholder="例如：妈妈" value={session.inviteRelation} />
      {showInvitePreview ? (
        session.invite ? <InviteCard invite={session.invite} origin={session.origin} mode="accept" /> : <p className="helperText">如果家人已经创建了宝宝相册，可以先让对方发你邀请码。</p>
      ) : null}
      <button onClick={() => void session.handleAcceptInvite()} type="button">{buttonLabel}</button>
    </>
  );
}
