"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { joinedBabySummaries } from "../model/babies";
import { buildBabyManagePath, buildFeedingHubPath, buildPhotosHubPath, buildSettingsBabiesNewPath, buildSettingsPath } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { AuthenticatedShell } from "../ui/authenticated-shell";
import { SettingsBabiesScene } from "../ui/settings-babies-scene";

export function SettingsBabiesRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const refreshApp = session.refreshApp;
  const joinedBabies = joinedBabySummaries(session.appState?.albums ?? []);

  useEffect(() => {
    void refreshApp(undefined, { silent: true, authenticated: true });
  }, [refreshApp]);

  return (
    <AuthenticatedShell
      activeNav="settings"
      feedingHref={buildFeedingHubPath()}
      photosHref={buildPhotosHubPath()}
      settingsHref={buildSettingsPath()}
    >
      <SettingsBabiesScene
        albumOptions={joinedBabies}
        className="panelStack settingsDetailPage settingsScene settingsSceneForward"
        onAdd={() => router.push(buildSettingsBabiesNewPath())}
        onBack={() => router.push(buildSettingsPath())}
        onOpenAlbumSettings={(targetBabyId) => router.push(buildBabyManagePath(targetBabyId))}
      />
    </AuthenticatedShell>
  );
}
