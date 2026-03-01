// Shared helpers for API route handlers.
// Provides auth extraction, JSON response helpers, and common patterns.

import { auth } from "@/auth";
import { query } from "@/lib/d1";
import { hashApiKey } from "@/lib/api-key";
import { settingsRepo } from "@/lib/settings-repo";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/timezone";

// Read lazily — env may be set after module import (e.g. in tests)
function isSkipAuth(): boolean {
  return process.env.E2E_SKIP_AUTH === "true";
}
const E2E_TEST_USER_ID = "e2e-test-user";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthenticatedUser {
  userId: string;
}

export interface ApiKeyUser extends AuthenticatedUser {
  deviceId: string;
}

// ---------------------------------------------------------------------------
// Session auth (dashboard routes)
// ---------------------------------------------------------------------------

/** Require a valid session. Returns userId or a 401 Response. */
export async function requireSession(): Promise<
  { user: AuthenticatedUser; error?: never } | { user?: never; error: Response }
> {
  if (isSkipAuth()) {
    return { user: { userId: E2E_TEST_USER_ID } };
  }

  const session = await auth();

  if (!session?.user?.id) {
    return { error: jsonError("Unauthorized", 401) };
  }

  return { user: { userId: session.user.id } };
}

// ---------------------------------------------------------------------------
// API key auth (macOS sync routes)
// ---------------------------------------------------------------------------

/** Require a valid API key. Returns userId + deviceId or an error Response. */
export async function requireApiKey(
  req: Request
): Promise<
  { user: ApiKeyUser; error?: never } | { user?: never; error: Response }
> {
  if (isSkipAuth()) {
    return { user: { userId: E2E_TEST_USER_ID, deviceId: "e2e-test-device" } };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return { error: jsonError("Missing or invalid Authorization header", 401) };
  }

  const keyHash = await hashApiKey(token);

  const rows = await query<{
    user_id: string;
    device_id: string;
    id: string;
  }>(
    "SELECT id, user_id, device_id FROM api_keys WHERE key_hash = ?",
    [keyHash]
  );

  if (rows.length === 0) {
    return { error: jsonError("Invalid API key", 401) };
  }

  const { user_id, device_id, id } = rows[0];

  // Update last_used timestamp (fire-and-forget)
  query("UPDATE api_keys SET last_used = ? WHERE id = ?", [
    new Date().toISOString(),
    id,
  ]).catch(() => {
    // Ignore update errors — non-critical
  });

  return { user: { userId: user_id, deviceId: device_id } };
}

// ---------------------------------------------------------------------------
// Bearer token extraction
// ---------------------------------------------------------------------------

/** Extract bearer token from Authorization header. */
export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;

  const match = header.match(/^bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) return null;

  return match[1].trim();
}

// ---------------------------------------------------------------------------
// JSON response helpers
// ---------------------------------------------------------------------------

/** Return a JSON success response. */
export function jsonOk(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

/** Return a JSON error response. */
export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

// ---------------------------------------------------------------------------
// User timezone
// ---------------------------------------------------------------------------

/**
 * Retrieve the user's IANA timezone from settings.
 * Falls back to DEFAULT_TIMEZONE ("Asia/Shanghai") if not set or invalid.
 */
export async function getUserTimezone(userId: string): Promise<string> {
  try {
    const row = await settingsRepo.findByKey(userId, "timezone");
    if (row && isValidTimezone(row.value)) {
      return row.value;
    }
  } catch {
    // DB error — use default
  }
  return DEFAULT_TIMEZONE;
}
