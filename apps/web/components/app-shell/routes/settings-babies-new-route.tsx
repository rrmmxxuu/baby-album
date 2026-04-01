"use client";

import { useRouter } from "next/navigation";
import { buildFeedingHubPath, buildPhotosHubPath, buildSettingsBabiesPath, buildSettingsPath } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { AuthenticatedShell } from "../ui/authenticated-shell";
import { SettingsAddBabyScene } from "../ui/settings-add-baby-scene";

export function SettingsBabiesNewRoute() {
  const router = useRouter();
  const session = useAppSessionContext();

  return (
    <AuthenticatedShell
      activeNav="settings"
      feedingHref={buildFeedingHubPath()}
      photosHref={buildPhotosHubPath()}
      settingsHref={buildSettingsPath()}
    >
      <SettingsAddBabyScene className="panelStack settingsDetailPage settingsScene settingsSceneForward" onBack={() => router.push(buildSettingsBabiesPath())} session={session} />
    </AuthenticatedShell>
  );
}
