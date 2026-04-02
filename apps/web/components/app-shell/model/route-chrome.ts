import type { Route } from "next";
import type { AppStatePayload } from "../../../lib/types";
import { joinedBabySummaries } from "./babies";
import { buildBabyPhotosPath, buildPhotosHubPath } from "./routes";

export type WorkspaceTab = "photos" | "feeding" | "settings";

export interface RouteChrome {
  activeTab: WorkspaceTab | null;
  bottomNavHidden: boolean;
}

interface SearchParamsReader {
  get(name: string): string | null;
}

function pathSegments(pathname: string) {
  return pathname.split("/").filter(Boolean);
}

function isBabyPhotosPath(pathname: string) {
  const segments = pathSegments(pathname);
  return segments.length === 3 && segments[0] === "babies" && segments[2] === "photos";
}

function isBabyFeedingPath(pathname: string) {
  const segments = pathSegments(pathname);
  return segments.length === 3 && segments[0] === "babies" && segments[2] === "feeding";
}

function isBabyManagePath(pathname: string) {
  const segments = pathSegments(pathname);
  return segments.length >= 3 && segments[0] === "babies" && segments[2] === "manage";
}

function photoBabyIdFromPathname(pathname: string) {
  if (!isBabyPhotosPath(pathname)) {
    return "";
  }
  return decodeURIComponent(pathSegments(pathname)[1] ?? "");
}

export function resolveRouteChrome(pathname: string, searchParams: SearchParamsReader): RouteChrome {
  if (pathname === "/settings") {
    return { activeTab: "settings", bottomNavHidden: false };
  }
  if (pathname.startsWith("/settings/") || isBabyManagePath(pathname)) {
    return { activeTab: "settings", bottomNavHidden: true };
  }
  if (pathname === "/feeding") {
    return { activeTab: "feeding", bottomNavHidden: false };
  }
  if (isBabyFeedingPath(pathname)) {
    return { activeTab: "feeding", bottomNavHidden: true };
  }
  if (pathname === "/photos") {
    return { activeTab: "photos", bottomNavHidden: false };
  }
  if (isBabyPhotosPath(pathname)) {
    const overlayOpen = Boolean(searchParams.get("lightbox") || searchParams.get("edit") || searchParams.get("composer"));
    return { activeTab: "photos", bottomNavHidden: overlayOpen };
  }
  return { activeTab: null, bottomNavHidden: false };
}

export function resolvePhotosTabHref(pathname: string, appState: AppStatePayload | null, lastViewedPhotoBabyId: string) {
  const currentPhotoBabyId = photoBabyIdFromPathname(pathname);
  if (currentPhotoBabyId) {
    return buildBabyPhotosPath(currentPhotoBabyId);
  }

  if (lastViewedPhotoBabyId) {
    return buildBabyPhotosPath(lastViewedPhotoBabyId);
  }

  const joinedBabies = joinedBabySummaries(appState?.albums ?? []);
  if (joinedBabies.length > 0) {
    return buildBabyPhotosPath(joinedBabies[0].baby.id);
  }

  return buildPhotosHubPath() as Route;
}

