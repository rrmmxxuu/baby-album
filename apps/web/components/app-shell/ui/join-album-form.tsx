import type { AppSessionState } from "../hooks/use-app-session";
import { RelationInput } from "./relation-input";

interface JoinAlbumFormProps {
  session: AppSessionState;
  title?: string;
  buttonLabel: string;
  relationListId: string;
}

export function JoinAlbumForm({ session, title, buttonLabel, relationListId }: JoinAlbumFormProps) {
  return (
    <div className="formGrid noAlbumForm">
      {title ? <p className="settingsCardTitle">{title}</p> : null}
      <label>
        邀请码
        <input
          autoCapitalize="characters"
          value={session.inviteCodeInput}
          onChange={(event) => session.setInviteCodeInput(event.target.value.replace(/\s+/g, "").toUpperCase())}
          placeholder="请输入邀请码"
        />
      </label>
      <RelationInput label="你与宝宝的关系" listId={relationListId} onChange={session.setInviteRelation} placeholder="例如：妈妈" value={session.inviteRelation} />
      <button onClick={() => void session.handleAcceptInvite()} type="button">{buttonLabel}</button>
    </div>
  );
}
