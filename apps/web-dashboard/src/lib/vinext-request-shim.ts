import type { NextRequest } from "next/server";

/**
 * Workaround for vinext 0.1.x's NextRequest constructor, which
 * spread-destructures its `init` argument:
 *
 *     const { nextConfig: _nextConfig, ...requestInit } = init ?? {};
 *     super(input, requestInit);
 *
 * Spread enumerates only OWN ENUMERABLE properties — but `method`,
 * `headers`, `body`, `redirect`, `signal` live on `Request.prototype` as
 * accessors, not as own keys. next-auth's `reqWithEnvURL` (called from
 * both the `auth(req => ...)` middleware wrapper and the route handlers
 * whenever NEXTAUTH_URL/AUTH_URL is set) does
 * `new NextRequest(href, req)`, which then runs through vinext's spread
 * and silently drops every Request field. The downstream
 * `new Request(string, {})` ends up with method "GET" and no headers,
 * which breaks both:
 *
 *   - OAuth POST signin (handler sees method=GET → throws
 *     `UnknownAction: Unsupported action`, redirects to
 *     `/login?error=Configuration`).
 *
 *   - Authenticated page navigation in proxy.ts (handler sees no cookie
 *     → `req.auth = null` → bounces logged-in users back to /login).
 *
 * The fix is to pin those fields as OWN ENUMERABLE data properties on
 * the incoming request before next-auth touches it. The vinext request
 * itself is a Proxy with no `defineProperty` trap, so the assignments
 * forward through to the underlying NextRequest and become real own
 * keys that any downstream spread will preserve. The body is also
 * drained to a string so a subsequent
 * `new NextRequest(url, this_request)` can re-read it (a stream can't
 * be consumed twice).
 *
 * Remove this shim once vinext stops spread-destructuring its
 * NextRequest init argument.
 */
export async function exposeOwnAccessors(req: Request): Promise<NextRequest> {
  const pin = (key: string, value: unknown) => {
    Object.defineProperty(req, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  };

  let bodyText: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      bodyText = await req.clone().text();
    } catch {
      // Drain failed — leave body untouched. Worst case the rebuilt
      // request is body-less, which is no worse than today.
    }
  }

  pin("method", req.method);
  pin("headers", req.headers);
  pin("redirect", req.redirect);
  if (req.signal) pin("signal", req.signal);
  if (bodyText !== undefined) {
    pin("body", bodyText);
  }
  return req as NextRequest;
}

/**
 * Synchronous variant for code paths that can't await — currently only
 * proxy.ts, which runs on every page request and shouldn't pay the
 * cost of draining the body. Middleware is GET-only in this project,
 * so the body field is irrelevant there.
 */
export function exposeOwnAccessorsSync(req: NextRequest): NextRequest {
  const pin = (key: string, value: unknown) => {
    Object.defineProperty(req, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  };
  pin("method", req.method);
  pin("headers", req.headers);
  pin("redirect", req.redirect);
  if (req.signal) pin("signal", req.signal);
  return req;
}
