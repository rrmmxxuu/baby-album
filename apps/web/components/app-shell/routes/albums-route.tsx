"use client";

import { useSearchParams } from "next/navigation";
import { NoAlbumScreen } from "../ui/no-album-screen";
import { AppPageFrame } from "../ui/app-page-frame";
import { resolveAlbumsRedirect } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { RouteRedirectNotice } from "./route-redirect-notice";

export function AlbumsRoute() {
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const inviteCode = searchParams.get("invite") ?? "";
  const activeAlbum = session.appState?.activeAlbum ?? null;
  const currentUser = session.appState?.currentUser ?? null;
  const redirectPath = resolveAlbumsRedirect({
    hydrated: session.hydrated,
    authToken: session.authToken,
    inviteCode,
    activeAlbumId: activeAlbum?.album.id,
    rememberedAlbumId: session.selectedAlbumId
  });

  return (
    <AppPageFrame currentUser={currentUser} session={session} showTopBar={!redirectPath && !session.loading}>
      {redirectPath ? <RouteRedirectNotice label="正在同步最新状态..." to={redirectPath} /> : null}
      {session.authToken && !activeAlbum && !session.loading ? <NoAlbumScreen session={session} /> : null}
      {session.loading && !redirectPath ? <p className="helperText loadingRow">正在同步最新状态...</p> : null}
    </AppPageFrame>
  );
}
