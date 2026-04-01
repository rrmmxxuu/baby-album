"use client";

import { useRouter } from "next/navigation";
import { useBabyRouteContext } from "../baby-route-context";
import { buildBabyManageMemberPath, buildBabyManageStoragePath, buildSettingsBabiesPath } from "../model/routes";
import { SettingsBabyDetailScene } from "../ui/settings-baby-detail-scene";

export function BabyManageRoute() {
  const router = useRouter();
  const { babyId, workspace, currentUser, session, settings, appView } = useBabyRouteContext();

  return (
    <SettingsBabyDetailScene
      activeAlbum={workspace}
      activeBaby={appView.activeBaby}
      albumInvites={appView.albumInvites}
      albumMembers={appView.albumMembers}
      canManageBabyProfile={appView.canManageBabyProfile}
      canManageInvites={appView.canManageInvites}
      canManageStorage={appView.canManageStorage}
      className="panelStack settingsDetailPage settingsScene settingsSceneForward"
      currentUser={currentUser}
      onBack={() => router.push(buildSettingsBabiesPath())}
      onOpenMemberDetail={(memberId) => router.push(buildBabyManageMemberPath(babyId, memberId))}
      onOpenStorage={() => router.push(buildBabyManageStoragePath(babyId))}
      session={session}
      settings={settings}
      storageStatusSummary={appView.storageStatusSummary}
      transferCandidates={appView.transferCandidates}
    />
  );
}
