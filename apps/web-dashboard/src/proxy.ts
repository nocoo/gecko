import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function pathnameOf(req: NextRequest): string {
  return req.nextUrl.pathname;
}

export function isMachinePath(pathname: string): boolean {
  if (pathname === "/api/live" || pathname === "/api/live/") return true;
  if (pathname === "/api/sync" || pathname === "/api/sync/") return true;
  if (pathname === "/api/backy/pull" || pathname === "/api/backy/pull/") return true;
  if (pathname === "/api/v1" || pathname.startsWith("/api/v1/")) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const pathname = pathnameOf(request);
  if (isMachinePath(pathname)) {
    return NextResponse.next();
  }
  const response = NextResponse.next();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$|.*\\.svg$).*)"],
};
