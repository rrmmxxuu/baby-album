"use client";

import { useSearchParams } from "next/navigation";
import { AuthScreen } from "../ui/auth-screen";
import { AppPageFrame } from "../ui/app-page-frame";
import { resolveAuthRedirect } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { RouteRedirectNotice } from "./route-redirect-notice";

export function AuthRoute() {
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const inviteCode = searchParams.get("invite") ?? "";
  const activeAlbum = session.appState?.activeAlbum ?? null;
  const currentUser = session.appState?.currentUser ?? null;
  const redirectPath = resolveAuthRedirect({
    hydrated: session.hydrated,
    authToken: session.authToken,
    inviteCode,
    activeAlbumId: activeAlbum?.album.id,
    rememberedAlbumId: session.selectedAlbumId,
    appStateReady: Boolean(session.appState),
    bootPhaseDone: session.bootPhase === "done"
  });

  return (
    <AppPageFrame currentUser={currentUser} session={session} showTopBar={!redirectPath && !session.loading}>
      {!session.authToken ? <AuthScreen session={session} /> : <RouteRedirectNotice label="正在同步最新状态..." to={redirectPath} />}
    </AppPageFrame>
  );
}
