import type { AppSessionState } from "../hooks/use-app-session";
import { CreateAlbumForm } from "./create-album-form";
import { JoinAlbumForm } from "./join-album-form";
import { SettingsHeader } from "./settings-header";
import { SettingsSection } from "../../ui/settings-section";

interface SettingsAddBabySceneProps {
  className: string;
  session: AppSessionState;
  onBack: () => void;
}

export function SettingsAddBabyScene({ className, session, onBack }: SettingsAddBabySceneProps) {
  return (
    <article className={className}>
      <SettingsHeader eyebrow="添加宝宝" onBack={onBack} title="新建或加入" />
      <SettingsSection title="自己新建">
        <CreateAlbumForm session={session} submitLabel="创建宝宝" />
      </SettingsSection>
      <SettingsSection title="邀请码加入">
        <JoinAlbumForm buttonLabel="加入宝宝" relationListId="invite-relation-settings" session={session} title={undefined} />
      </SettingsSection>
    </article>
  );
}
