"use client";

import { useRouter } from "next/navigation";
import { useBabyRouteContext } from "../baby-route-context";
import { buildBabyManagePath } from "../model/routes";
import { SettingsMemberDetailScene } from "../ui/settings-member-detail-scene";

interface BabyMemberRouteProps {
  memberId: string;
}

export function BabyMemberRoute({ memberId }: BabyMemberRouteProps) {
  const router = useRouter();
  const { babyId, workspace, currentUser, settings, appView } = useBabyRouteContext();

  return (
    <SettingsMemberDetailScene
      activeAlbum={workspace}
      albumMembers={appView.albumMembers}
      className="panelStack settingsDetailPage settingsScene settingsSceneForward"
      currentUser={currentUser}
      memberId={memberId}
      onBack={() => router.push(buildBabyManagePath(babyId))}
      settings={settings}
    />
  );
}
