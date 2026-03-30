"use client";

import { useSearchParams } from "next/navigation";
import { useAppSessionContext } from "../app-session-provider";
import { AppPageFrame } from "../ui/app-page-frame";
import { AuthScreen } from "../ui/auth-screen";
import { resolveHomeRedirect } from "../model/routes";
import { RouteRedirectNotice } from "./route-redirect-notice";

export function HomeRoute() {
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const activeAlbum = session.appState?.activeAlbum ?? null;
  const currentUser = session.appState?.currentUser ?? null;
  const inviteCode = searchParams.get("invite") ?? "";
  const redirectPath = resolveHomeRedirect({
    hydrated: session.hydrated,
    authToken: session.authToken,
    inviteCode,
    activeAlbumId: activeAlbum?.album.id,
    rememberedAlbumId: session.selectedAlbumId,
    appStateReady: Boolean(session.appState),
    bootPhaseDone: session.bootPhase === "done"
  });
  const showAuthScreen = session.hydrated && !session.authToken;
  const blocking = Boolean(redirectPath || (session.authToken && !session.appState));

  return (
    <AppPageFrame blocking={blocking} currentUser={currentUser} session={session} showTopBar={false}>
      {redirectPath ? <RouteRedirectNotice label="正在进入宝宝相册..." to={redirectPath} /> : null}
      {!blocking && showAuthScreen ? <AuthScreen session={session} /> : null}
    </AppPageFrame>
  );
}
