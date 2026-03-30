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
  const showLoading = Boolean(session.authToken) && !redirectPath;

  return (
    <AppPageFrame currentUser={currentUser} session={session} showTopBar={false}>
      {redirectPath ? <RouteRedirectNotice label="正在进入宝宝相册..." to={redirectPath} /> : null}
      {showAuthScreen ? <AuthScreen session={session} /> : null}
      {showLoading ? <p className="helperText loadingRow">{inviteCode ? "正在准备邀请信息..." : "正在同步最新状态..."}</p> : null}
    </AppPageFrame>
  );
}
