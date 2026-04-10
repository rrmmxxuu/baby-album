import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { clearSessionCookies, getBackendApiBaseUrl, SESSION_COOKIE_NAME } from "../../../../lib/session";

function upstreamHeaders(upstream: Response) {
  const headers = new Headers();
  const headerNames = [
    "Content-Type",
    "Content-Length",
    "Cache-Control",
    "Content-Disposition",
    "Content-Range",
    "Accept-Ranges",
    "ETag",
    "Last-Modified",
    "X-Request-ID"
  ];
  for (const name of headerNames) {
    const value = upstream.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

function requestBody(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }
  return request.body;
}

async function proxyRequest(request: NextRequest, path: string[]) {
  const url = new URL(`${getBackendApiBaseUrl()}/${path.join("/")}`);
  url.search = request.nextUrl.search;

  const headers = new Headers();
  const accept = request.headers.get("Accept");
  const contentType = request.headers.get("Content-Type") ?? "";
  const range = request.headers.get("Range");
  const ifNoneMatch = request.headers.get("If-None-Match");
  const ifModifiedSince = request.headers.get("If-Modified-Since");
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";

  if (accept) {
    headers.set("Accept", accept);
  }
  if (range) {
    headers.set("Range", range);
  }
  if (ifNoneMatch) {
    headers.set("If-None-Match", ifNoneMatch);
  }
  if (ifModifiedSince) {
    headers.set("If-Modified-Since", ifModifiedSince);
  }
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const body = requestBody(request);

  const upstream = await fetch(url, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
    redirect: "manual",
    ...(body ? { duplex: "half" as const } : {})
  });
  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: upstreamHeaders(upstream)
  });

  if (upstream.status === 401) {
    clearSessionCookies(response);
  }

  return response;
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await context.params).path);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await context.params).path);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await context.params).path);
}

export async function HEAD(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(request, (await context.params).path);
}
