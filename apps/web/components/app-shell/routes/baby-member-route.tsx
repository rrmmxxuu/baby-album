"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useBabyRouteContext } from "../baby-route-context";
import { buildBabyManagePath } from "../model/routes";
import { useWorkspaceScrollReset } from "../workspace-viewport";
import { SettingsDetailLoadingSkeleton } from "../ui/loading-skeletons";
import { SettingsMemberDetailScene } from "../ui/settings-member-detail-scene";

interface BabyMemberRouteProps {
  memberId: string;
}

export function BabyMemberRoute({ memberId }: BabyMemberRouteProps) {
  const router = useRouter();
  const { babyId, workspace, currentUser, settings, appView, session } = useBabyRouteContext();
  const refreshApp = session.refreshApp;
  const [initialRefreshSettled, setInitialRefreshSettled] = useState(false);

  useWorkspaceScrollReset();

  useEffect(() => {
    let cancelled = false;
    if (!session.isAuthenticated) {
      setInitialRefreshSettled(true);
      return;
    }
    setInitialRefreshSettled(false);
    void refreshApp(workspace.album.id, { silent: true }).finally(() => {
      if (!cancelled) {
        setInitialRefreshSettled(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshApp, session.isAuthenticated, workspace.album.id]);

  async function handleRemoveMember(targetMemberId: string) {
    const removed = await settings.handleRemoveMember(targetMemberId);
    if (removed) {
      router.push(buildBabyManagePath(babyId));
    }
  }

  if (!initialRefreshSettled) {
    return <SettingsDetailLoadingSkeleton ariaLabel="正在刷新成员信息" />;
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
