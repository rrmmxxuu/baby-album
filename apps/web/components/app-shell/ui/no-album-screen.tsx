import type { AppSessionState } from "../hooks/use-app-session";
import { CreateAlbumForm } from "./create-album-form";
import { JoinAlbumForm } from "./join-album-form";
import { SectionHeading } from "../../ui/section-heading";

interface NoAlbumScreenProps {
  session: AppSessionState;
}

export function NoAlbumScreen({ session }: NoAlbumScreenProps) {
  return (
    <section className="gridColumns">
      <article className="panelStack panel">
        <SectionHeading eyebrow="加入相册" title="输入邀请码" />
        <JoinAlbumForm buttonLabel="加入已有相册" relationListId="invite-relation-empty" session={session} showInvitePreview />
      </article>

      <article className="panelStack panel">
        <SectionHeading eyebrow="创建相册" title="创建第一个宝宝相册" />
        <CreateAlbumForm session={session} submitLabel="创建宝宝相册" />
        <p className="helperText">系统会自动为这个宝宝创建一个相册空间，并将你设为所有者。</p>
      </article>
    </section>
  );
}
