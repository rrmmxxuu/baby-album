import type {
  AlbumInvite,
  AppStatePayload,
  BreastFeedingTimerSession,
  FeedingDayPayload,
  FeedingTimerActionInput,
  FeedingEntry,
  FeedingEntryUpsertInput,
  Role,
  SessionAuthPayload,
  StorageNodePairing,
  TimelineComment,
  TimelineEntry,
  TimelinePagePayload,
  TimelineTimeMode,
  TimelineVisibility
} from "./types";

const apiBaseUrl = "/api/proxy";
const sessionApiBaseUrl = "/api/session";

export class ApiError extends Error {
  status: number;
  requestId: string;

  constructor(message: string, status: number, requestId = "") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.requestId = requestId;
  }
}

export class FeedingTimerConflictError extends ApiError {
  session: BreastFeedingTimerSession | null;

  constructor(message: string, status: number, session: BreastFeedingTimerSession | null, requestId = "") {
    super(message, status, requestId);
    this.name = "FeedingTimerConflictError";
    this.session = session;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const requestId = response.headers.get("X-Request-ID") ?? "";
  const raw = await response.text();
  let payload = {} as T & { error?: string };
  if (raw) {
    try {
      payload = JSON.parse(raw) as T & { error?: string };
    } catch {
      payload = { error: raw } as T & { error?: string };
    }
  }
  if (!response.ok) {
    throw new ApiError(payload.error ?? `Request failed with status ${response.status}`, response.status, requestId);
  }
  return payload;
}

function buildHeaders(extra?: HeadersInit): HeadersInit {
  return {
    ...extra
  };
}

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export async function reportClientError(input: {
  message: string;
  stack?: string;
  path: string;
  userAgent: string;
  displayMode: string;
  requestId?: string;
  albumId?: string;
  extra?: Record<string, unknown>;
}) {
  await fetch(`${apiBaseUrl}/api/v1/client-errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true
  });
}

export function getPreviewUrl(mediaId: string, albumId: string, version?: string) {
  const suffix = version ? `&v=${encodeURIComponent(version)}` : "";
  return `${apiBaseUrl}/api/v1/media/${encodeURIComponent(mediaId)}/preview?albumId=${encodeURIComponent(albumId)}${suffix}`;
}

export function getScreenPreviewUrl(mediaId: string, albumId: string, version?: string) {
  const suffix = version ? `&v=${encodeURIComponent(version)}` : "";
  return `${apiBaseUrl}/api/v1/media/${encodeURIComponent(mediaId)}/screen-preview?albumId=${encodeURIComponent(albumId)}${suffix}`;
}

export function getOriginalUrl(mediaId: string, albumId: string) {
  return `${apiBaseUrl}/api/v1/media/${encodeURIComponent(mediaId)}/original?albumId=${encodeURIComponent(albumId)}`;
}

export function getBabyAvatarUrl(babyId: string, albumId: string, version?: string) {
  const suffix = version ? `&v=${encodeURIComponent(version)}` : "";
  return `${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/avatar?albumId=${encodeURIComponent(albumId)}${suffix}`;
}

export async function loadOriginalStatus(albumId: string, mediaId: string, options?: { triggerRestore?: boolean }) {
  const query = new URLSearchParams({ albumId });
  if (options?.triggerRestore) {
    query.set("triggerRestore", "true");
  }
  const response = await fetch(`${apiBaseUrl}/api/v1/media/${encodeURIComponent(mediaId)}/original-status?${query.toString()}`, {
    cache: "no-store"
  });
  return parseResponse<{ originalAvailability: "hot" | "warm" | "cold" | "restoring" | "unavailable"; originalUrl?: string; media: import("./types").MediaAsset }>(response);
}

export async function repairMediaPreview(albumId: string, mediaId: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/media/${encodeURIComponent(mediaId)}/preview-repair?albumId=${encodeURIComponent(albumId)}`, {
    method: "POST"
  });
  return parseResponse<{ media: import("./types").MediaAsset }>(response);
}

export async function loadAppState(albumId?: string): Promise<AppStatePayload> {
  const albumQuery = albumId ? `?albumId=${encodeURIComponent(albumId)}` : "";
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/app${albumQuery}`, {
    cache: "no-store"
  });
  return parseResponse<AppStatePayload>(response);
}

export async function loadTimelinePage(albumId: string, input?: { cursor?: string; limit?: number }): Promise<TimelinePagePayload> {
  const query = new URLSearchParams({ albumId });
  if (input?.cursor) {
    query.set("cursor", input.cursor);
  }
  if (typeof input?.limit === "number" && Number.isFinite(input.limit)) {
    query.set("limit", `${input.limit}`);
  }
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline?${query.toString()}`, {
    cache: "no-store"
  });
  return parseResponse<TimelinePagePayload>(response);
}

export async function loadFeedingDay(babyId: string, day: string): Promise<FeedingDayPayload> {
  const query = new URLSearchParams();
  if (day) {
    query.set("day", day);
  }
  const suffix = query.toString();
  const response = await fetch(`${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/feeding${suffix ? `?${suffix}` : ""}`, {
    cache: "no-store"
  });
  return parseResponse<FeedingDayPayload>(response);
}

async function parseFeedingTimerStateResponse(response: Response) {
  const requestId = response.headers.get("X-Request-ID") ?? "";
  const raw = await response.text();
  let payload: { session?: BreastFeedingTimerSession | null; error?: string } = { session: null, error: "" };
  if (raw) {
    try {
      payload = JSON.parse(raw) as { session?: BreastFeedingTimerSession | null; error?: string };
    } catch {
      payload = { session: null, error: raw };
    }
  }
  if (response.status === 409) {
    throw new FeedingTimerConflictError(payload.error ?? "conflict", response.status, payload.session ?? null, requestId);
  }
  if (!response.ok) {
    throw new ApiError(payload.error ?? `Request failed with status ${response.status}`, response.status, requestId);
  }
  return payload.session ?? null;
}

export async function loadFeedingTimer(babyId: string): Promise<BreastFeedingTimerSession | null> {
  const response = await fetch(`${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/feeding-timer`, {
    cache: "no-store"
  });
  return parseFeedingTimerStateResponse(response);
}

export async function applyFeedingTimerAction(babyId: string, input: FeedingTimerActionInput): Promise<BreastFeedingTimerSession | null> {
  const response = await fetch(`${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/feeding-timer/actions`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseFeedingTimerStateResponse(response);
}

export async function finishFeedingTimer(babyId: string, input: { expectedVersion: number; note: string }): Promise<FeedingEntry> {
  const response = await fetch(`${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/feeding-timer/finish`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  if (response.status === 409) {
    await parseFeedingTimerStateResponse(response);
  }
  return parseResponse<FeedingEntry>(response);
}

export function feedingTimerStreamUrl(babyId: string) {
  return `${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/feeding-timer/stream`;
}

export async function createFeedingEntry(babyId: string, input: FeedingEntryUpsertInput): Promise<FeedingEntry> {
  const response = await fetch(`${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/feeding-entries`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<FeedingEntry>(response);
}

export async function updateFeedingEntry(babyId: string, entryId: string, input: FeedingEntryUpsertInput): Promise<FeedingEntry> {
  const response = await fetch(`${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/feeding-entries/${encodeURIComponent(entryId)}`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<FeedingEntry>(response);
}

export async function deleteFeedingEntry(babyId: string, entryId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/babies/${encodeURIComponent(babyId)}/feeding-entries/${encodeURIComponent(entryId)}`, {
    method: "DELETE"
  });
  await parseResponse<{ deleted: boolean }>(response);
}

export async function registerUser(input: { displayName: string; email: string; password: string }): Promise<SessionAuthPayload> {
  const response = await fetch(`${sessionApiBaseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return parseResponse<SessionAuthPayload>(response);
}

export async function loginUser(input: { email: string; password: string }): Promise<SessionAuthPayload> {
  const response = await fetch(`${sessionApiBaseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  return parseResponse<SessionAuthPayload>(response);
}

export async function logoutUser(_token?: string): Promise<void> {
  const response = await fetch(`${sessionApiBaseUrl}/logout`, { method: "POST" });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Logout failed");
  }
}

export async function createAlbum(input: { name: string; timezone: string; babyName: string; birthDate?: string; relation: string }) {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<{ id: string; name: string; timezone: string }>(response);
}

export async function leaveAlbum(albumId: string, transferOwnerTo?: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/leave`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ transferOwnerTo: transferOwnerTo ?? "" })
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Leave album failed");
  }
}

export async function updateMemberRole(albumId: string, memberUserId: string, role: Role) {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/members/${encodeURIComponent(memberUserId)}/role`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ role })
  });
  return parseResponse<{ userId: string; role: Role }>(response);
}

export async function updateMemberRelation(albumId: string, memberUserId: string, relation: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/members/${encodeURIComponent(memberUserId)}/relation`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ relation })
  });
  return parseResponse<{ userId: string; relation?: string }>(response);
}

export async function removeMember(albumId: string, memberUserId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/members/${encodeURIComponent(memberUserId)}`, {
    method: "DELETE"
  });
  await parseResponse<{ removed: boolean }>(response);
}

export async function createInvite(albumId: string): Promise<AlbumInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/invites`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({})
  });
  return parseResponse<AlbumInvite>(response);
}

export async function createStorageNodePairing(albumId: string): Promise<StorageNodePairing> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/storage-pairing`, {
    method: "POST"
  });
  return parseResponse<StorageNodePairing>(response);
}

export async function loadInvite(code: string): Promise<AlbumInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/invites/${encodeURIComponent(code)}`, { cache: "no-store" });
  return parseResponse<AlbumInvite>(response);
}

export async function acceptInvite(code: string, relation: string): Promise<AlbumInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/invites/${encodeURIComponent(code)}/accept`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ relation })
  });
  return parseResponse<AlbumInvite>(response);
}

export async function createTimelineEntry(input: { albumId: string; caption: string; visibility: TimelineVisibility; timeMode: TimelineTimeMode; displayAt: string }): Promise<TimelineEntry> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<TimelineEntry>(response);
}

export async function updateTimelineEntry(entryId: string, input: { albumId: string; caption: string; visibility: TimelineVisibility; timeMode: TimelineTimeMode; displayAt: string }): Promise<TimelineEntry> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries/${encodeURIComponent(entryId)}`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<TimelineEntry>(response);
}

export async function createTimelineComment(entryId: string, input: { albumId: string; content: string }): Promise<TimelineComment> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries/${encodeURIComponent(entryId)}/comments`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<TimelineComment>(response);
}

export async function deleteTimelineEntry(albumId: string, entryId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries/${encodeURIComponent(entryId)}?albumId=${encodeURIComponent(albumId)}`, {
    method: "DELETE"
  });
  await parseResponse<{ deleted: boolean }>(response);
}

export async function deleteTimelineEntryMedia(albumId: string, entryId: string, mediaId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/timeline-entries/${encodeURIComponent(entryId)}/media/${encodeURIComponent(mediaId)}?albumId=${encodeURIComponent(albumId)}`, {
    method: "DELETE"
  });
  await parseResponse<{ deleted: boolean }>(response);
}

export async function updateBabyProfile(albumId: string, babyId: string, input: { name: string; birthDate?: string }) {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/babies/${encodeURIComponent(babyId)}`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<{ id: string; name: string; birthDate?: string }>(response);
}

export async function uploadBabyAvatar(albumId: string, babyId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/babies/${encodeURIComponent(babyId)}/avatar`, {
    method: "POST",
    body: formData
  });
  return parseResponse<{ id: string; hasAvatar?: boolean }>(response);
}

export async function probeDuplicateMedia(albumId: string, input: { items: Array<{ clientId: string; byteSize: number }> }, signal?: AbortSignal): Promise<{ items: Array<{ clientId: string; needsHash: boolean }> }> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/duplicate-media/probe`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
    signal
  });
  return parseResponse<{ items: Array<{ clientId: string; needsHash: boolean }> }>(response);
}

export async function resolveDuplicateMedia(albumId: string, input: { items: Array<{ clientId: string; sha256: string }> }, signal?: AbortSignal): Promise<{ items: Array<{ clientId: string; duplicate: boolean; duplicateCount: number }> }> {
  const response = await fetch(`${apiBaseUrl}/api/v1/albums/${encodeURIComponent(albumId)}/duplicate-media/resolve`, {
    method: "POST",
    headers: buildHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
    signal
  });
  return parseResponse<{ items: Array<{ clientId: string; duplicate: boolean; duplicateCount: number }> }>(response);
}
