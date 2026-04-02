"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSessionContext } from "../app-session-provider";
import { joinedBabySummaries } from "../model/babies";
import { LAST_VIEWED_PHOTO_BABY_STORAGE_KEY } from "../model/constants";
import { buildBabyPhotosPath, buildFeedingHubPath, buildPhotosHubPath, buildSettingsPath, buildWelcomePath } from "../model/routes";
import { AuthenticatedShell } from "../ui/authenticated-shell";
import { PhotosRouteSkeleton } from "../ui/loading-skeletons";

export function PhotosHubRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const joinedBabies = joinedBabySummaries(session.appState?.albums ?? []);

  useEffect(() => {
    if (session.bootPhase !== "done") {
      return;
    }
    if (!session.appState) {
      void session.refreshApp(undefined, { silent: true, authenticated: true });
      return;
    }
    if (joinedBabies.length === 0) {
      router.replace(buildWelcomePath());
      return;
    }
    const storedBabyId = window.localStorage.getItem(LAST_VIEWED_PHOTO_BABY_STORAGE_KEY) ?? "";
    const target = joinedBabies.find((item) => item.baby.id === storedBabyId) ?? joinedBabies[0];
    router.replace(buildBabyPhotosPath(target.baby.id));
  }, [joinedBabies, router, session.appState, session.bootPhase, session.refreshApp]);

  return (
    <AuthenticatedShell
      activeNav="photos"
      feedingHref={buildFeedingHubPath()}
      photosHref={buildPhotosHubPath()}
      settingsHref={buildSettingsPath()}
    >
      <PhotosRouteSkeleton ariaLabel="正在进入宝宝时间线" />
    </AuthenticatedShell>
  );
}
