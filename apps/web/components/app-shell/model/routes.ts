import type { Route } from "next";

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

export function buildWelcomePath() {
  return "/welcome" as Route;
}

export function buildPhotosHubPath() {
  return "/photos" as Route;
}

export function buildFeedingHubPath() {
  return "/feeding" as Route;
}

export function buildSettingsPath() {
  return "/settings" as Route;
}

export function buildSettingsAccountPath() {
  return "/settings/account" as Route;
}

export function buildSettingsBabiesPath() {
  return "/settings/babies" as Route;
}

export function buildSettingsBabiesNewPath() {
  return "/settings/babies/new" as Route;
}

export function buildBabyPath(babyId: string) {
  return `/babies/${encodeURIComponent(babyId)}` as Route;
}

export function buildBabyPhotosPath(babyId: string, options?: { lightboxEntryId?: string | null; mediaId?: string | null; composer?: "new" | null; editEntryId?: string | null }) {
  const basePath = `/babies/${encodeURIComponent(babyId)}/photos`;
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

export function buildBabyFeedingPath(babyId: string, options?: { day?: string | null; composer?: "milk" | "solid" | "diaper" | "sleep" | "supplement" | "medicine" | null; editEntryId?: string | null }) {
  const basePath = `/babies/${encodeURIComponent(babyId)}/feeding`;
  const query = new URLSearchParams();
  if (options?.day) {
    query.set("day", options.day);
  }
  if (options?.editEntryId) {
    query.set("edit", options.editEntryId);
  } else if (options?.composer) {
    query.set("composer", options.composer);
  }
  const queryString = query.toString();
  return (queryString ? `${basePath}?${queryString}` : basePath) as Route;
}

export function buildBabyManagePath(babyId: string) {
  return `/babies/${encodeURIComponent(babyId)}/manage` as Route;
}

export function buildBabyManageMemberPath(babyId: string, memberId: string) {
  return `/babies/${encodeURIComponent(babyId)}/manage/members/${encodeURIComponent(memberId)}` as Route;
}

export function buildBabyManageStoragePath(babyId: string) {
  return `/babies/${encodeURIComponent(babyId)}/manage/storage` as Route;
}
