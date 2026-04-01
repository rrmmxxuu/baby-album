"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useBabyRouteContext } from "../baby-route-context";
import { buildBabyManagePath } from "../model/routes";
import { SettingsMemberDetailScene } from "../ui/settings-member-detail-scene";

interface BabyMemberRouteProps {
  memberId: string;
}

export function BabyMemberRoute({ memberId }: BabyMemberRouteProps) {
  const router = useRouter();
  const { babyId, workspace, currentUser, settings, appView, session } = useBabyRouteContext();
  const refreshApp = session.refreshApp;

  useEffect(() => {
    void refreshApp(workspace.album.id, { silent: true, authenticated: true });
  }, [refreshApp, workspace.album.id]);

  async function handleRemoveMember(targetMemberId: string) {
    const removed = await settings.handleRemoveMember(targetMemberId);
    if (removed) {
      router.push(buildBabyManagePath(babyId));
    }
  }

  return (
    <SettingsMemberDetailScene
      activeAlbum={workspace}
      albumMembers={appView.albumMembers}
      className="panelStack settingsDetailPage settingsScene settingsSceneForward"
      currentUser={currentUser}
      memberId={memberId}
      onBack={() => router.push(buildBabyManagePath(babyId))}
      onRemoveMember={(targetMemberId) => void handleRemoveMember(targetMemberId)}
      settings={settings}
    />
  );
}
