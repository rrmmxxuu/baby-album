"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ApiError } from "../../../lib/api";
import type { AlbumWorkspace } from "../../../lib/types";
import { BabyRouteProvider } from "../baby-route-context";
import { useAppSessionContext } from "../app-session-provider";
import { useSettingsState } from "../hooks/use-settings-state";
import { findJoinedBaby, joinedBabySummaries } from "../model/babies";
import { errorMessageFromUnknown } from "../model/feedback";
import { buildAppShellViewModel } from "../model/view";
import { buildAuthPath, buildBabyFeedingPath, buildBabyPhotosPath, buildFeedingHubPath, buildSettingsBabiesPath, buildSettingsPath, buildWelcomePath } from "../model/routes";
import { AuthenticatedShell } from "../ui/authenticated-shell";
import { FeedingRouteSkeleton, PhotosRouteSkeleton, SettingsDetailLoadingSkeleton } from "../ui/loading-skeletons";

interface BabyRouteShellProps {
  babyId: string;
  children: React.ReactNode;
}

function routeNavKey(pathname: string) {
  if (pathname.endsWith("/photos")) {
    return "photos" as const;
  }
  if (pathname.endsWith("/feeding")) {
    return "feeding" as const;
  }
  return "settings" as const;
}

function workspaceFallbackPath(hasJoinedBabies: boolean) {
  return hasJoinedBabies ? buildSettingsBabiesPath() : buildWelcomePath();
}

export function BabyRouteShell({ babyId, children }: BabyRouteShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useAppSessionContext();
  const [workspace, setWorkspace] = useState<AlbumWorkspace | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<ApiError | null>(null);
  const requestIdRef = useRef(0);

  const navKey = routeNavKey(pathname);
  const currentUser = session.appState?.currentUser ?? workspace?.currentUser ?? null;
  const joinedBabies = useMemo(() => joinedBabySummaries(session.appState?.albums ?? []), [session.appState?.albums]);
  const appView = useMemo(() => buildAppShellViewModel({
    activeAlbum: workspace,
    currentUser,
    settingsNavDirection: "forward",
    storagePairing: null
  }), [currentUser, workspace]);

  const settings = useSettingsState({
    activeTab: navKey,
    activeAlbum: workspace,
    currentUser,
    refreshApp: session.refreshApp,
    clearFeedback: session.clearFeedback,
    showSuccess: session.showSuccess,
    showWarning: session.showWarning,
    showError: session.showError
  });

  useEffect(() => {
    const sessionWorkspace = session.appState?.activeAlbum ?? null;
    if (!sessionWorkspace || !workspace || sessionWorkspace.album.id !== workspace.album.id) {
      return;
    }
    setWorkspace(sessionWorkspace);
    setWorkspaceError(null);
  }, [session.appState?.activeAlbum, workspace?.album.id]);

  useEffect(() => {
    if (session.bootPhase !== "done") {
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    let cancelled = false;

    async function ensureWorkspace() {
      try {
        setWorkspaceError(null);
        let sessionState = session.appState;
        let targetBaby = findJoinedBaby(sessionState?.albums ?? [], babyId);

        if (!targetBaby) {
          sessionState = await session.refreshApp(undefined, { silent: true, authenticated: true });
          targetBaby = findJoinedBaby(sessionState?.albums ?? [], babyId);
        }

        if (cancelled || requestIdRef.current !== requestId) {
          return;
        }
        if (!sessionState) {
          throw new ApiError("宝宝空间加载失败。", 500);
        }
        if (!targetBaby) {
          throw new ApiError("not found", 404);
        }
        const targetAlbumId = targetBaby.album.id;
        const currentWorkspace = workspace;
        const sessionWorkspace = sessionState.activeAlbum ?? null;

        if (sessionWorkspace && sessionWorkspace.album.id === targetAlbumId) {
          setWorkspace(sessionWorkspace);
          setLoadingWorkspace(false);
          return;
        }

        if (currentWorkspace && currentWorkspace.album.id === targetAlbumId) {
          setLoadingWorkspace(false);
          return;
        }

        setLoadingWorkspace(true);
        if (!currentWorkspace || currentWorkspace.album.id !== targetAlbumId) {
          setWorkspace(null);
        }

        const nextState = await session.refreshApp(targetAlbumId, { silent: true, authenticated: true });
        const next = nextState?.activeAlbum ?? null;
        if (cancelled || requestIdRef.current !== requestId) {
          return;
        }
        if (!next || next.album.id !== targetBaby.album.id) {
          throw new ApiError("not found", 404);
        }
        setWorkspace(next);
        setWorkspaceError(null);
      } catch (error) {
        if (cancelled || requestIdRef.current !== requestId) {
          return;
        }
        setWorkspaceError(error instanceof ApiError ? error : new ApiError(errorMessageFromUnknown(error, "宝宝空间加载失败。"), 500));
      } finally {
        if (!cancelled && requestIdRef.current === requestId) {
          setLoadingWorkspace(false);
        }
      }
    }

    void ensureWorkspace();
    return () => {
      cancelled = true;
    };
  }, [babyId, session.appState, session.bootPhase, session.refreshApp, workspace?.album.id]);

  useEffect(() => {
    if (!workspaceError || loadingWorkspace || session.bootPhase !== "done") {
      return;
    }
    if (workspaceError.status === 401) {
      void session.handleLogout();
      router.replace(buildAuthPath());
      return;
    }
    if (workspaceError.status === 403 || workspaceError.status === 404) {
      router.replace(workspaceFallbackPath(joinedBabies.length > 0));
      return;
    }
    session.showError("加载失败", workspaceError.message || "宝宝空间加载失败。");
  }, [joinedBabies.length, loadingWorkspace, router, session.handleLogout, session.showError, session.bootPhase, workspaceError]);

  const photosHref = navKey === "feeding" ? buildBabyPhotosPath(babyId) : navKey === "photos" ? buildBabyPhotosPath(babyId) : buildBabyPhotosPath(babyId);
  const feedingHref = navKey === "feeding" ? buildBabyFeedingPath(babyId) : buildFeedingHubPath();
  const settingsHref = buildSettingsPath();
  const fallbackAriaLabel = loadingWorkspace ? "正在获取这个宝宝的最新内容" : "当前地址不可用，正在返回可访问页面";
  const fallbackContent = navKey === "feeding"
    ? <FeedingRouteSkeleton ariaLabel={fallbackAriaLabel} />
    : navKey === "photos"
      ? <PhotosRouteSkeleton ariaLabel={fallbackAriaLabel} />
      : <SettingsDetailLoadingSkeleton ariaLabel={fallbackAriaLabel} />;

  return (
    <AuthenticatedShell
      activeNav={navKey}
      blocking={false}
      bottomNavHidden={navKey === "feeding"}
      feedingHref={feedingHref}
      photosHref={photosHref}
      settingsHref={settingsHref}
    >
      {workspace ? (
        <BabyRouteProvider
          value={{
            babyId,
            workspace,
            currentUser,
            joinedBabies,
            session,
            settings,
            appView
          }}
        >
          {children}
        </BabyRouteProvider>
      ) : (
        fallbackContent
      )}
    </AuthenticatedShell>
  );
}
