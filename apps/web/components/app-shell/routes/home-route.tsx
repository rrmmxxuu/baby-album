"use client";

import { useAppSessionContext } from "../app-session-provider";
import { AppPageFrame } from "../ui/app-page-frame";
import { AuthScreen } from "../ui/auth-screen";

export function HomeRoute() {
  const session = useAppSessionContext();
  const currentUser = session.appState?.currentUser ?? null;
  const blocking = session.isAuthenticated;

  return (
    <AppPageFrame blocking={blocking} currentUser={currentUser} session={session} showTopBar={false}>
      {!session.isAuthenticated ? <AuthScreen session={session} /> : null}
    </AppPageFrame>
  );
}
