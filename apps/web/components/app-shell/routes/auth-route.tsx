"use client";

import { AuthScreen } from "../ui/auth-screen";
import { AppPageFrame } from "../ui/app-page-frame";
import { useAppSessionContext } from "../app-session-provider";

export function AuthRoute() {
  const session = useAppSessionContext();
  const currentUser = session.appState?.currentUser ?? null;
  const blocking = session.isAuthenticated;

  return (
    <AppPageFrame blocking={blocking} currentUser={currentUser} session={session} showTopBar={false}>
      {!session.isAuthenticated ? <AuthScreen session={session} /> : null}
    </AppPageFrame>
  );
}
