import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { exposeOwnAccessorsSync } from "@/lib/vinext-request-shim";

// Skip auth in E2E test environment
const SKIP_AUTH = process.env.E2E_SKIP_AUTH === "true";

// Build redirect URL respecting reverse proxy headers.
// In production, always force HTTPS to prevent Mixed Content errors
// (Railway's reverse proxy may forward x-forwarded-proto: http).
function buildRedirectUrl(req: NextRequest, pathname: string): URL {
  const forwardedHost = req.headers.get("x-forwarded-host");

  if (forwardedHost) {
    const proto =
      process.env.NODE_ENV === "production"
        ? "https"
        : req.headers.get("x-forwarded-proto") || "https";
    return new URL(pathname, `${proto}://${forwardedHost}`);
  }

  return new URL(pathname, req.nextUrl.origin);
}

// Next.js 16 proxy convention (replaces middleware.ts)
const authHandler = auth((req) => {
  if (SKIP_AUTH) {
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth;
  const isLoginPage = req.nextUrl.pathname === "/login";
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth");
  const isLiveRoute = req.nextUrl.pathname === "/api/live";
  // API-key authenticated requests (Mac client → /api/sync, /api/v1/*) carry
  // a Bearer token instead of a session cookie. They have no session, so the
  // redirect-to-/login branch below would 307 them into /login (a Page), and
  // vinext returns 405 for non-GET requests to a Page route. Let these
  // through so the route handler's requireApiKey() can do the real check
  // (and return a proper 401 on bad tokens).
  const hasBearerToken = req.headers
    .get("authorization")
    ?.toLowerCase()
    .startsWith("bearer ");

  // Allow auth routes, health check, and Bearer-authenticated API requests through
  if (isAuthRoute || isLiveRoute || hasBearerToken) {
    return NextResponse.next();
  }

  // Redirect to home if logged in and trying to access login page
  if (isLoginPage && isLoggedIn) {
    return NextResponse.redirect(buildRedirectUrl(req, "/"));
  }

  // Redirect to login if not logged in and trying to access protected page
  if (!isLoginPage && !isLoggedIn) {
    return NextResponse.redirect(buildRedirectUrl(req, "/login"));
  }

  return NextResponse.next();
});

// Export as named 'proxy' function for Next.js 16
export function proxy(request: NextRequest) {
  // Skip the auth() wrapper entirely for Bearer-authenticated requests.
  // Calling auth() always spread-destructures the request via vinext's
  // NextRequest constructor; for POSTs with a large body that drains the
  // ReadableStream once on the proxy side, and the downstream route
  // handler's req.text() / req.json() then hangs waiting for the
  // already-consumed body. Mac client sync POSTs trip exactly this path.
  // Bearer-auth means we never look at session cookies anyway, so the
  // route handler's requireApiKey() does the real authentication.
  const hasBearerToken = request.headers
    .get("authorization")
    ?.toLowerCase()
    .startsWith("bearer ");
  if (hasBearerToken) {
    return NextResponse.next();
  }
  return authHandler(exposeOwnAccessorsSync(request), {} as never);
}

export const config = {
  matcher: [
    // Match everything EXCEPT static assets and the next-auth route handlers.
    // /api/auth/* MUST be excluded: if the proxy invokes `auth()` on those
    // endpoints, the middleware-side auth() generates its own CSRF cookie
    // which vinext then forwards as an extra Set-Cookie on the route
    // handler's response, leaving the browser with a CSRF cookie that no
    // longer matches the token returned by /api/auth/csrf — every sign-in
    // then fails with MissingCSRF. (The previous matcher used
    // `api/(?!auth)` inside the exclusion lookahead, which inverted the
    // intent and instead *included* /api/auth/*. This was harmless until
    // vinext 0.1.x started honouring the Next.js 16 `proxy.ts` convention
    // and actually started executing this file.)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png$|.*\\.ico$|.*\\.svg$|api/auth).*)",
  ],
};
