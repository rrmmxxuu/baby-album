"use client";

import { useSearchParams } from "next/navigation";
import { NoAlbumScreen } from "../ui/no-album-screen";
import { AppPageFrame } from "../ui/app-page-frame";
import { resolveAlbumsRedirect } from "../model/routes";
import { useAppSessionContext } from "../app-session-provider";
import { RouteRedirect } from "./route-redirect-notice";

export function AlbumsRoute() {
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const inviteCode = searchParams.get("invite") ?? "";
  const activeAlbum = session.appState?.activeAlbum ?? null;
  const currentUser = session.appState?.currentUser ?? null;
  const redirectPath = resolveAlbumsRedirect({
    hydrated: session.hydrated,
    activeAlbumId: activeAlbum?.album.id
  });
  const blocking = Boolean(redirectPath || (session.isAuthenticated && session.loading && !activeAlbum));

  return (
    <AppPageFrame blocking={blocking} currentUser={currentUser} session={session} showTopBar={!redirectPath && !session.loading}>
      {redirectPath ? <RouteRedirect to={redirectPath} /> : null}
      {!blocking && session.isAuthenticated && !activeAlbum && !session.loading ? <NoAlbumScreen session={session} /> : null}
    </AppPageFrame>
  );
}
