"use client";

import { useRouter } from "next/navigation";
import { buildSettingsBabiesPath } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { useWorkspaceScrollReset } from "../workspace-viewport";
import { SettingsAddBabyScene } from "../ui/settings-add-baby-scene";

export function SettingsBabiesNewRoute() {
  const router = useRouter();
  const session = useAppSessionContext();

  useWorkspaceScrollReset();

  return (
    <SettingsAddBabyScene className="panelStack settingsDetailPage settingsScene settingsSceneForward" onBack={() => router.push(buildSettingsBabiesPath())} session={session} />
  );
}
