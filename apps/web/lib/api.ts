import type { AlbumInvite, AppStatePayload, AuthPayload, Role, StorageNodePairing, TimelineComment, TimelineEntry, TimelinePagePayload, TimelineTimeMode, TimelineVisibility } from "./types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed with status ${response.status}`);
  }
  return payload;
}

function buildHeaders(token?: string, extra?: HeadersInit): HeadersInit {
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  };
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export function getPreviewUrl(mediaId: string, albumId: string, token: string, version?: string) {
  const suffix = version ? `&v=${encodeURIComponent(version)}` : "";
  return `${apiBaseUrl}/api/v1/media/${encodeURIComponent(mediaId)}/preview?albumId=${encodeURIComponent(albumId)}&token=${encodeURIComponent(token)}${suffix}`;
}

export function getOriginalUrl(mediaId: string, albumId: string, token: string) {
  return `${apiBaseUrl}/api/v1/media/${encodeURIComponent(mediaId)}/original?albumId=${encodeURIComponent(albumId)}&token=${encodeURIComponent(token)}`;
}

export function getBabyAvatarUrl(babyId: string, albumId: string, token: string, version?: string) {
  const suffix = version ? `&v=${encodeURIComponent(version)}` : "";
  return `${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/avatar?albumId=${encodeURIComponent(albumId)}&token=${encodeURIComponent(token)}${suffix}`;
}

export async function loadAppState(token: string, albumId?: string): Promise<AppStatePayload> {
  const albumQuery = albumId ? `?albumId=${encodeURIComponent(albumId)}` : "";
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/app${albumQuery}`, {
    headers: buildHeaders(token),
    cache: "no-store"
  });
  return parseResponse<AppStatePayload>(response);
}

export async function loadTimelinePage(token: string, albumId: string, input?: { cursor?: string; limit?: number }): Promise<TimelinePagePayload> {
  const query = new URLSearchParams({ albumId });
  if (input?.cursor) {
    query.set("cursor", input.cursor);
  }
  if (typeof input?.limit === "number" && Number.isFinite(input.limit)) {
    query.set("limit", `${input.limit}`);
  }
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline?${query.toString()}`, {
    headers: buildHeaders(token),
    cache: "no-store"
  });
  return parseResponse<TimelinePagePayload>(response);
}

export async function registerUser(input: { displayName: string; email: string; password: string }): Promise<AuthPayload> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return parseResponse<AuthPayload>(response);
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthPayload> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return parseResponse<AuthPayload>(response);
}

export async function logoutUser(token: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
    method: "POST",
    headers: buildHeaders(token)
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Logout failed");
  }
}

export async function createAlbum(token: string, input: { name: string; timezone: string; babyName: string; birthDate?: string; relation: string }) {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<{ id: string; name: string; timezone: string }>(response);
}

export async function leaveAlbum(token: string, albumId: string, transferOwnerTo?: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/leave`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ transferOwnerTo: transferOwnerTo ?? "" })
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Leave album failed");
  }
}

export async function updateMemberRole(token: string, albumId: string, memberUserId: string, role: Role) {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/members/${encodeURIComponent(memberUserId)}/role`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ role })
  });
  return parseResponse<{ userId: string; role: Role }>(response);
}

export async function updateMemberRelation(token: string, albumId: string, memberUserId: string, relation: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/members/${encodeURIComponent(memberUserId)}/relation`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ relation })
  });
  return parseResponse<{ userId: string; relation?: string }>(response);
}

export async function createInvite(token: string, albumId: string): Promise<AlbumInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/invites`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({})
  });
  return parseResponse<AlbumInvite>(response);
}

export async function createStorageNodePairing(token: string, albumId: string): Promise<StorageNodePairing> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/storage-pairing`, {
    method: "POST",
    headers: buildHeaders(token)
  });
  return parseResponse<StorageNodePairing>(response);
}

export async function loadInvite(code: string): Promise<AlbumInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/invites/${encodeURIComponent(code)}`, { cache: "no-store" });
  return parseResponse<AlbumInvite>(response);
}

export async function acceptInvite(token: string, code: string, relation: string): Promise<AlbumInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/invites/${encodeURIComponent(code)}/accept`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ relation })
  });
  return parseResponse<AlbumInvite>(response);
}

export async function createTimelineEntry(token: string, input: { albumId: string; caption: string; visibility: TimelineVisibility; timeMode: TimelineTimeMode; displayAt: string }): Promise<TimelineEntry> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<TimelineEntry>(response);
}

export async function updateTimelineEntry(token: string, entryId: string, input: { albumId: string; caption: string; visibility: TimelineVisibility; timeMode: TimelineTimeMode; displayAt: string }): Promise<TimelineEntry> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries/${encodeURIComponent(entryId)}`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<TimelineEntry>(response);
}

export async function createTimelineComment(token: string, entryId: string, input: { albumId: string; content: string }): Promise<TimelineComment> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries/${encodeURIComponent(entryId)}/comments`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<TimelineComment>(response);
}

export async function deleteTimelineEntry(token: string, albumId: string, entryId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries/${encodeURIComponent(entryId)}?albumId=${encodeURIComponent(albumId)}`, {
    method: "DELETE",
    headers: buildHeaders(token)
  });
  await parseResponse<{ deleted: boolean }>(response);
}

export async function deleteTimelineEntryMedia(token: string, albumId: string, entryId: string, mediaId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries/${encodeURIComponent(entryId)}/media/${encodeURIComponent(mediaId)}?albumId=${encodeURIComponent(albumId)}`, {
    method: "DELETE",
    headers: buildHeaders(token)
  });
  await parseResponse<{ deleted: boolean }>(response);
}

export async function updateBabyProfile(token: string, albumId: string, babyId: string, input: { name: string; birthDate?: string }) {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/babies/${encodeURIComponent(babyId)}`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<{ id: string; name: string; birthDate?: string }>(response);
}

export async function uploadBabyAvatar(token: string, albumId: string, babyId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/babies/${encodeURIComponent(babyId)}/avatar`, {
    method: "POST",
    headers: buildHeaders(token),
    body: formData
  });
  return parseResponse<{ id: string; hasAvatar?: boolean }>(response);
}
