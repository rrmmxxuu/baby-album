"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { joinedBabySummaries } from "../model/babies";
import { buildBabyManagePath, buildSettingsBabiesNewPath, buildSettingsPath } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { useWorkspaceScrollReset } from "../workspace-viewport";
import { SettingsBabiesScene } from "../ui/settings-babies-scene";

export function SettingsBabiesRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const refreshApp = session.refreshApp;
  const joinedBabies = joinedBabySummaries(session.appState?.albums ?? []);

  useWorkspaceScrollReset();

  useEffect(() => {
    if (!session.isAuthenticated) {
      return;
    }
    void refreshApp(undefined, { silent: true });
  }, [refreshApp, session.isAuthenticated]);

  return (
    <SettingsBabiesScene
      albumOptions={joinedBabies}
      className="panelStack settingsDetailPage settingsScene settingsSceneForward"
      onAdd={() => router.push(buildSettingsBabiesNewPath())}
      onBack={() => router.push(buildSettingsPath())}
      onOpenAlbumSettings={(targetBabyId) => router.push(buildBabyManagePath(targetBabyId))}
    />
  );
}
