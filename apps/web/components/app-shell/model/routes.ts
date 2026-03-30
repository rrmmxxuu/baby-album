import type { Route } from "next";
import type { SettingsScreen, TabKey } from "./types";

const ROUTABLE_SETTINGS_SCREENS: SettingsScreen[] = ["menu", "account", "babies", "addBaby", "babyDetail", "memberDetail", "storage"];

function appendInvite(path: string, inviteCode?: string) {
  if (!inviteCode) {
    return path as Route;
  }
  const query = new URLSearchParams({ invite: inviteCode });
  return `${path}?${query.toString()}` as Route;
}

export function buildAuthPath(inviteCode?: string) {
  return appendInvite("/auth", inviteCode);
}

export function buildAlbumsPath(inviteCode?: string) {
  return appendInvite("/albums", inviteCode);
}

export function buildPhotosPath(albumId: string, options?: { lightboxEntryId?: string | null; mediaId?: string | null; composer?: "new" | null; editEntryId?: string | null }) {
  const basePath = `/album/${encodeURIComponent(albumId)}/photos`;
  const query = new URLSearchParams();
  if (options?.editEntryId) {
    query.set("edit", options.editEntryId);
  } else if (options?.composer === "new") {
    query.set("composer", "new");
  } else if (options?.lightboxEntryId) {
    query.set("lightbox", options.lightboxEntryId);
    if (options.mediaId) {
      query.set("media", options.mediaId);
    }
  }
  const queryString = query.toString();
  return (queryString ? `${basePath}?${queryString}` : basePath) as Route;
}

export function buildAlbumPath(albumId: string, tab: TabKey, options?: { screen?: SettingsScreen | null; memberId?: string | null }) {
  const basePath = `/album/${encodeURIComponent(albumId)}/${tab}`;
  if (tab !== "settings" || !options?.screen || options.screen === "menu") {
    return basePath as Route;
  }
  const query = new URLSearchParams({ screen: options.screen });
  if (options.screen === "memberDetail" && options.memberId) {
    query.set("memberId", options.memberId);
  }
  return `${basePath}?${query.toString()}` as Route;
}

export function parseSettingsScreen(value: string | null): SettingsScreen | null {
  if (!value) {
    return null;
  }
  return ROUTABLE_SETTINGS_SCREENS.includes(value as SettingsScreen) ? value as SettingsScreen : null;
}

interface AlbumsRedirectState {
  hydrated: boolean;
  activeAlbumId?: string | null;
}

interface AlbumRedirectState {
  bootPhaseDone: boolean;
  inviteCode?: string;
  activeTab: TabKey;
  requestedAlbumId: string;
  activeAlbumId?: string | null;
  loading: boolean;
  albumRefreshing: boolean;
}

export function resolveAlbumsRedirect({ hydrated, activeAlbumId }: AlbumsRedirectState) {
  if (!hydrated) {
    return null;
  }
  if (activeAlbumId) {
    return buildAlbumPath(activeAlbumId, "photos");
  }
  return null;
}

export function resolveAlbumRedirect({ bootPhaseDone, inviteCode, activeTab, requestedAlbumId, activeAlbumId, loading, albumRefreshing }: AlbumRedirectState) {
  if (!bootPhaseDone) {
    return null;
  }
  if (loading || albumRefreshing) {
    return null;
  }
  if (!activeAlbumId) {
    return buildAlbumsPath(inviteCode);
  }
  if (activeAlbumId !== requestedAlbumId) {
    return buildAlbumPath(activeAlbumId, activeTab);
  }
  return null;
}
