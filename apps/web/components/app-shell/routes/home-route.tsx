"use client";

import { useSearchParams } from "next/navigation";
import { resolveHomeRedirect } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { AppPageFrame } from "../ui/app-page-frame";
import { RouteRedirectNotice } from "./route-redirect-notice";

export function HomeRoute() {
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const inviteCode = searchParams.get("invite") ?? "";
  const activeAlbum = session.appState?.activeAlbum ?? null;
  const currentUser = session.appState?.currentUser ?? null;
  const redirectPath = resolveHomeRedirect({
    hydrated: session.hydrated,
    authToken: session.authToken,
    inviteCode,
    activeAlbumId: activeAlbum?.album.id,
    rememberedAlbumId: session.selectedAlbumId,
    appStateReady: Boolean(session.appState),
    bootPhaseDone: session.bootPhase === "done"
  });

  return (
    <AppPageFrame currentUser={currentUser} session={session} showTopBar>
      <section className="pageStack">
        <article className="panel">
          <RouteRedirectNotice label="正在进入宝宝相册..." to={redirectPath} />
        </article>
      </section>
    </AppPageFrame>
  );
}
