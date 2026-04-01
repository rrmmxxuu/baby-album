"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { joinedBabySummaries } from "../model/babies";
import { buildFeedingHubPath, buildPhotosHubPath, buildSettingsPath } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { NoAlbumScreen } from "../ui/no-album-screen";
import { AuthenticatedShell } from "../ui/authenticated-shell";

export function WelcomeRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const joinedBabies = joinedBabySummaries(session.appState?.albums ?? []);

  useEffect(() => {
    if (session.bootPhase !== "done" || joinedBabies.length === 0) {
      return;
    }
    router.replace(buildPhotosHubPath());
  }, [joinedBabies.length, router, session.bootPhase]);

  return (
    <AuthenticatedShell
      activeNav="settings"
      feedingHref={buildFeedingHubPath()}
      photosHref={buildPhotosHubPath()}
      settingsHref={buildSettingsPath()}
    >
      {joinedBabies.length === 0 ? <NoAlbumScreen session={session} /> : null}
    </AuthenticatedShell>
  );
}
