"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAppSessionContext } from "../app-session-provider";
import { joinedBabySummaries } from "../model/babies";
import { LAST_VIEWED_PHOTO_BABY_STORAGE_KEY } from "../model/constants";
import { buildBabyPhotosPath, buildWelcomePath } from "../model/routes";
import { PhotosRouteSkeleton } from "../ui/loading-skeletons";

export function PhotosHubRoute() {
  const router = useRouter();
  const session = useAppSessionContext();
  const joinedBabies = joinedBabySummaries(session.appState?.albums ?? []);

  useEffect(() => {
    if (session.bootPhase !== "done" || !session.isAuthenticated) {
      return;
    }
    if (!session.appState) {
      void session.refreshApp(undefined, { silent: true });
      return;
    }
    if (joinedBabies.length === 0) {
      router.replace(buildWelcomePath());
      return;
    }
    const storedBabyId = window.localStorage.getItem(LAST_VIEWED_PHOTO_BABY_STORAGE_KEY) ?? "";
    const target = joinedBabies.find((item) => item.baby.id === storedBabyId) ?? joinedBabies[0];
    router.replace(buildBabyPhotosPath(target.baby.id), { scroll: false });
  }, [joinedBabies, router, session.appState, session.bootPhase, session.isAuthenticated, session.refreshApp]);

  return <PhotosRouteSkeleton ariaLabel="正在进入宝宝时间线" />;
}
