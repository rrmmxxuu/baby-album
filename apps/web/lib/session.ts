export const SESSION_COOKIE_NAME = "baby-album.session";
export const SESSION_EXP_COOKIE_NAME = "baby-album.session-exp";

interface CookieReader {
  get(name: string): { value?: string } | undefined;
}

interface CookieWriter {
  cookies: {
    set(name: string, value: string, options: {
      httpOnly: boolean;
      sameSite: "lax";
      secure: boolean;
      path: string;
      expires: Date;
    }): void;
  };
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires
  };
}

export function getBackendApiBaseUrl() {
  return (process.env.INTERNAL_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
}

export function parseSessionExpiry(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

export function hasValidSession(reader: CookieReader, now = Date.now()) {
  const token = reader.get(SESSION_COOKIE_NAME)?.value ?? "";
  if (!token) {
    return false;
  }
  const expiresAt = parseSessionExpiry(reader.get(SESSION_EXP_COOKIE_NAME)?.value ?? "");
  return expiresAt === null || expiresAt > now;
}

export function setSessionCookies(response: CookieWriter, token: string, expiresAt: string | Date) {
  const expiryDate = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  response.cookies.set(SESSION_COOKIE_NAME, token, cookieOptions(expiryDate));
  response.cookies.set(SESSION_EXP_COOKIE_NAME, `${expiryDate.getTime()}`, cookieOptions(expiryDate));
}

export function clearSessionCookies(response: CookieWriter) {
  const expired = new Date(0);
  response.cookies.set(SESSION_COOKIE_NAME, "", cookieOptions(expired));
  response.cookies.set(SESSION_EXP_COOKIE_NAME, "", cookieOptions(expired));
}

export function authPathWithInvite(inviteCode?: string | null) {
  if (!inviteCode) {
    return "/auth";
  }
  const query = new URLSearchParams({ invite: inviteCode });
  return `/auth?${query.toString()}`;
}

export function albumsPathWithInvite(inviteCode?: string | null) {
  if (!inviteCode) {
    return "/albums";
  }
  const query = new URLSearchParams({ invite: inviteCode });
  return `/albums?${query.toString()}`;
}
