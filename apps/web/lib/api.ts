import type { AppStatePayload, AuthPayload, FamilyInvite, Role } from "./types";

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

export function getPreviewUrl(mediaId: string, familyId: string, token: string) {
  return `${apiBaseUrl}/api/v1/media/${encodeURIComponent(mediaId)}/preview?familyId=${encodeURIComponent(familyId)}&token=${encodeURIComponent(token)}`;
}

export async function loadAppState(token: string, familyId?: string): Promise<AppStatePayload> {
  const familyQuery = familyId ? `?familyId=${encodeURIComponent(familyId)}` : "";
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/app${familyQuery}`, {
    headers: buildHeaders(token),
    cache: "no-store"
  });
  return parseResponse<AppStatePayload>(response);
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

export async function createFamily(token: string, input: { name: string; timezone: string }) {
  const response = await fetch(`${apiBaseUrl}/api/v1/families`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<{ id: string; name: string; timezone: string }>(response);
}

export async function createBaby(token: string, familyId: string, input: { name: string; birthDate?: string }) {
  const response = await fetch(`${apiBaseUrl}/api/v1/families/${encodeURIComponent(familyId)}/babies`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(input)
  });
  return parseResponse<{ id: string }>(response);
}

export async function deleteBaby(token: string, familyId: string, babyId: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/families/${encodeURIComponent(familyId)}/babies/${encodeURIComponent(babyId)}`, {
    method: "DELETE",
    headers: buildHeaders(token)
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Delete baby failed");
  }
}

export async function leaveFamily(token: string, familyId: string, transferOwnerTo?: string): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/v1/families/${encodeURIComponent(familyId)}/leave`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ transferOwnerTo: transferOwnerTo ?? "" })
  });
  if (!response.ok) {
    const payload = (await response.json()) as { error?: string };
    throw new Error(payload.error ?? "Leave family failed");
  }
}

export async function updateMemberRole(token: string, familyId: string, memberUserId: string, role: Role) {
  const response = await fetch(`${apiBaseUrl}/api/v1/families/${encodeURIComponent(familyId)}/members/${encodeURIComponent(memberUserId)}/role`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ role })
  });
  return parseResponse<{ userId: string; role: Role }>(response);
}

export async function createInvite(token: string, familyId: string, role: Role): Promise<FamilyInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/families/${encodeURIComponent(familyId)}/invites`, {
    method: "POST",
    headers: buildHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ role })
  });
  return parseResponse<FamilyInvite>(response);
}

export async function loadInvite(code: string): Promise<FamilyInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/invites/${encodeURIComponent(code)}`, { cache: "no-store" });
  return parseResponse<FamilyInvite>(response);
}

export async function acceptInvite(token: string, code: string): Promise<FamilyInvite> {
  const response = await fetch(`${apiBaseUrl}/api/v1/invites/${encodeURIComponent(code)}/accept`, {
    method: "POST",
    headers: buildHeaders(token)
  });
  return parseResponse<FamilyInvite>(response);
}