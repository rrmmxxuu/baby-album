import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authPathWithInvite, clearSessionCookies, hasValidSession, SESSION_COOKIE_NAME, SESSION_EXP_COOKIE_NAME } from "./lib/session";

function isProtectedPath(pathname: string) {
  return pathname === "/welcome"
    || pathname === "/photos"
    || pathname === "/feeding"
    || pathname === "/settings"
    || pathname.startsWith("/settings/")
    || pathname.startsWith("/babies/");
}

function isPublicAuthPath(pathname: string) {
  return pathname === "/" || pathname === "/auth";
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const inviteCode = request.nextUrl.searchParams.get("invite");
  const hasSessionCookies = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value || request.cookies.get(SESSION_EXP_COOKIE_NAME)?.value);
  const authenticated = hasValidSession(request.cookies);

  if (!authenticated) {
    if (isProtectedPath(pathname)) {
      const response = NextResponse.redirect(new URL(authPathWithInvite(inviteCode), request.url));
      if (hasSessionCookies) {
        clearSessionCookies(response);
      }
      return response;
    }
    if (hasSessionCookies) {
      const response = NextResponse.next();
      clearSessionCookies(response);
      return response;
    }
    return NextResponse.next();
  }

  if (isPublicAuthPath(pathname)) {
    return NextResponse.redirect(new URL("/photos", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/auth", "/welcome", "/photos", "/feeding", "/settings/:path*", "/babies/:path*"]
};
