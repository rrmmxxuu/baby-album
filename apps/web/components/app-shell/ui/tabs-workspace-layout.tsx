"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useAppSessionContext } from "../app-session-provider";
import { LAST_VIEWED_PHOTO_BABY_STORAGE_KEY } from "../model/constants";
import { resolvePhotosTabHref, resolveRouteChrome, type WorkspaceTab } from "../model/route-chrome";
import { buildFeedingHubPath, buildSettingsPath } from "../model/routes";
import { WorkspaceViewportProvider } from "../workspace-viewport";
import { AppBottomNav } from "./app-bottom-nav";
import { AppPageFrame } from "./app-page-frame";

interface TabsWorkspaceLayoutProps {
  children: React.ReactNode;
  photos: React.ReactNode;
  feeding: React.ReactNode;
  settings: React.ReactNode;
}

interface WorkspacePaneProps {
  active: boolean;
  children: React.ReactNode;
  tab: WorkspaceTab;
}

function WorkspacePane({ active, children, tab }: WorkspacePaneProps) {
  const paneRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const pane = paneRef.current;
    if (!pane) {
      return;
    }

    if (active) {
      pane.removeAttribute("inert");
      return;
    }

    if (pane.contains(document.activeElement)) {
      const nextFocusTarget = document.querySelector<HTMLElement>(".tabWorkspacePaneActive .tabWorkspaceViewport, .bottomNav .navActive");
      nextFocusTarget?.focus();
    }

    pane.setAttribute("inert", "");
  }, [active]);

  return (
    <div className={`tabWorkspacePane ${active ? "tabWorkspacePaneActive" : "tabWorkspacePaneInactive"}`} data-tab={tab} hidden={!active} ref={paneRef}>
      <WorkspaceViewportProvider active={active} tab={tab} viewportRef={viewportRef}>
        <div className="tabWorkspaceViewport" ref={viewportRef} tabIndex={active ? -1 : undefined}>
          {children}
        </div>
      </WorkspaceViewportProvider>
    </div>
  );
}

export function TabsWorkspaceLayout({ children, feeding, photos, settings }: TabsWorkspaceLayoutProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const session = useAppSessionContext();
  const currentUser = session.appState?.currentUser ?? null;
  const chrome = useMemo(() => resolveRouteChrome(pathname, searchParams), [pathname, searchParams]);
  const [lastViewedPhotoBabyId, setLastViewedPhotoBabyId] = useState("");

  useEffect(() => {
    setLastViewedPhotoBabyId(window.localStorage.getItem(LAST_VIEWED_PHOTO_BABY_STORAGE_KEY) ?? "");
  }, [pathname, searchParams]);

  const photosHref = useMemo(
    () => resolvePhotosTabHref(pathname, session.appState, lastViewedPhotoBabyId),
    [lastViewedPhotoBabyId, pathname, session.appState]
  );

  const showBottomNav = Boolean(chrome.activeTab && !chrome.bottomNavHidden);

  if (!chrome.activeTab) {
    return <>{children}</>;
  }

  return (
    <AppPageFrame
      authenticated={session.isAuthenticated}
      currentUser={currentUser}
      hasBottomNav={showBottomNav}
      session={session}
      showTopBar={false}
    >
      <div className="tabWorkspaceRoot">
        <WorkspacePane active={chrome.activeTab === "photos"} tab="photos">
          {photos}
        </WorkspacePane>
        <WorkspacePane active={chrome.activeTab === "feeding"} tab="feeding">
          {feeding}
        </WorkspacePane>
        <WorkspacePane active={chrome.activeTab === "settings"} tab="settings">
          {settings}
        </WorkspacePane>
        {children}
      </div>

      {showBottomNav ? (
        <AppBottomNav
          activeKey={chrome.activeTab}
          feedingHref={buildFeedingHubPath()}
          hidden={false}
          photosHref={photosHref}
          settingsHref={buildSettingsPath()}
        />
      ) : null}
    </AppPageFrame>
  );
}
