import { NextResponse } from "next/server";
import { getBackendApiBaseUrl, setSessionCookies } from "../../../../lib/session";

function requestHeaders(upstream: Response) {
  const headers = new Headers();
  const requestId = upstream.headers.get("X-Request-ID");
  if (requestId) {
    headers.set("X-Request-ID", requestId);
  }
  return headers;
}

export async function POST(request: Request) {
  const upstream = await fetch(`${getBackendApiBaseUrl()}/api/v1/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
    cache: "no-store"
  });
  const headers = requestHeaders(upstream);
  const raw = await upstream.text();

  if (!upstream.ok) {
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
    return new NextResponse(raw || "{}", {
      status: upstream.status,
      headers
    });
  }

  let payload: { user: unknown; token: string; expiresAt: string };
  try {
    payload = JSON.parse(raw) as { user: unknown; token: string; expiresAt: string };
  } catch {
    return NextResponse.json({ error: "invalid auth response" }, { status: 502 });
  }

  const response = NextResponse.json({ user: payload.user, expiresAt: payload.expiresAt }, { status: upstream.status, headers });
  setSessionCookies(response, payload.token, payload.expiresAt);
  return response;
}
