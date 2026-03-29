"use client";

import { useSearchParams } from "next/navigation";
import { useAppSessionContext } from "../app-session-provider";
import { AppPageFrame } from "../ui/app-page-frame";
import { AuthScreen } from "../ui/auth-screen";
import { NoAlbumScreen } from "../ui/no-album-screen";
import { buildAlbumPath } from "../model/routes";
import { RouteRedirectNotice } from "./route-redirect-notice";

export function HomeRoute() {
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const activeAlbum = session.appState?.activeAlbum ?? null;
  const currentUser = session.appState?.currentUser ?? null;
  const inviteCode = searchParams.get("invite") ?? "";
  const targetAlbumId = activeAlbum?.album.id ?? session.selectedAlbumId;
  const redirectPath = session.hydrated && session.authToken && targetAlbumId && session.bootPhase === "done"
    ? buildAlbumPath(targetAlbumId, "photos")
    : null;
  const showAuthScreen = session.hydrated && !session.authToken;
  const showNoAlbumScreen = session.hydrated && Boolean(session.authToken) && session.bootPhase === "done" && !targetAlbumId && !session.loading;
  const showLoading = !redirectPath && !showAuthScreen && !showNoAlbumScreen;

  return (
    <AppPageFrame currentUser={currentUser} session={session} showTopBar={showNoAlbumScreen}>
      {redirectPath ? (
        <RouteRedirectNotice label="正在进入宝宝相册..." to={redirectPath} />
      ) : null}
      {showAuthScreen ? <AuthScreen session={session} /> : null}
      {showNoAlbumScreen ? <NoAlbumScreen session={session} /> : null}
      {showLoading ? <p className="helperText loadingRow">{inviteCode ? "正在准备邀请信息..." : "正在同步最新状态..."}</p> : null}
    </AppPageFrame>
  );
}
