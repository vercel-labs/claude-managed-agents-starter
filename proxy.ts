import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

function isPublicPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/auth/error" || pathname.startsWith("/auth/error/"))
    return true;
  if (pathname.startsWith("/.well-known/workflow")) return true;
  return false;
}

function needsAuth(pathname: string) {
  return (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/api/managed-agents") ||
    pathname.startsWith("/api/github")
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!needsAuth(pathname)) {
    return NextResponse.next();
  }

  const token = getSessionCookie(request);
  if (!token) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.well-known/workflow/).*)",
  ],
};
