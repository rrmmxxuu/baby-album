"use client";

import type { Route } from "next";
import { useAppSessionContext } from "../app-session-provider";
import { AppPageFrame } from "./app-page-frame";
import { AppBottomNav } from "./app-bottom-nav";

type ShellNavKey = "photos" | "feeding" | "settings";

interface AuthenticatedShellProps {
  children: React.ReactNode;
  activeNav?: ShellNavKey | null;
  blocking?: boolean;
  bottomNavHidden?: boolean;
  photosHref?: Route;
  feedingHref?: Route;
  settingsHref?: Route;
}

export function AuthenticatedShell({ children, activeNav, blocking, bottomNavHidden, photosHref, feedingHref, settingsHref }: AuthenticatedShellProps) {
  const session = useAppSessionContext();
  const currentUser = session.appState?.currentUser ?? null;
  const showBottomNav = Boolean(activeNav && photosHref && feedingHref && settingsHref && !bottomNavHidden);

  return (
    <AppPageFrame
      authenticated={session.isAuthenticated}
      blocking={blocking}
      currentUser={currentUser}
      hasBottomNav={showBottomNav}
      session={session}
      showTopBar={false}
    >
      {children}
      {showBottomNav ? (
        <AppBottomNav
          activeKey={activeNav}
          feedingHref={feedingHref!}
          hidden={bottomNavHidden}
          photosHref={photosHref!}
          settingsHref={settingsHref!}
        />
      ) : null}
    </AppPageFrame>
  );
}
