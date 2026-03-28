import type { AppSessionState } from "../hooks/use-app-session";
import { RelationInput } from "./relation-input";

interface CreateAlbumFormProps {
  session: AppSessionState;
  submitLabel: string;
}

export function CreateAlbumForm({ session, submitLabel }: CreateAlbumFormProps) {
  return (
    <form className="formGrid noAlbumForm" onSubmit={session.handleCreateAlbum}>
      <label>
        宝宝姓名
        <input value={session.babyName} onChange={(event) => session.setBabyName(event.target.value)} />
      </label>
      <label>
        出生日期
        <input type="date" value={session.babyBirthDate} onChange={(event) => session.setBabyBirthDate(event.target.value)} />
      </label>
      <RelationInput label="你与宝宝的关系" listId="create-relation-form" onChange={session.setCreateRelation} placeholder="例如：爸爸" value={session.createRelation} />
      <label>
        宝宝头像
        <input accept="image/*" onChange={(event) => session.setCreateBabyAvatarFile(event.target.files?.[0] ?? null)} type="file" />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
