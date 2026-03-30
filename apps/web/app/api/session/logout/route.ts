import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearSessionCookies, getBackendApiBaseUrl, SESSION_COOKIE_NAME } from "../../../../lib/session";

export async function POST(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  let requestId = "";

  if (token) {
    try {
      const upstream = await fetch(`${getBackendApiBaseUrl()}/api/v1/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store"
      });
      requestId = upstream.headers.get("X-Request-ID") ?? "";
    } catch {
      // Local logout should stay deterministic even if the upstream call fails.
    }
  }

  const response = NextResponse.json({ status: "logged_out" });
  if (requestId) {
    response.headers.set("X-Request-ID", requestId);
  }
  clearSessionCookies(response);
  return response;
}
