import { AccessError, assertHumanOrigin, resolveHumanUser } from "@/lib/access";
import { hashApiKey } from "@/lib/api-key";
import { query } from "@/lib/d1";
import { settingsRepo } from "@/lib/settings-repo";
import { DEFAULT_TIMEZONE, isValidTimezone } from "@/lib/timezone";

export interface AuthenticatedUser {
  userId: string;
  email?: string;
  name?: string;
}

export interface ApiKeyUser extends AuthenticatedUser {
  deviceId: string;
}

export async function requireSession(
  req: Request,
): Promise<{ user: AuthenticatedUser; error?: never } | { user?: never; error: Response }> {
  try {
    assertHumanOrigin(req);
    const accessUser = await resolveHumanUser(req);
    return {
      user: {
        userId: accessUser.id,
        email: accessUser.email,
        name: accessUser.name,
      },
    };
  } catch (err) {
    if (err instanceof AccessError) {
      return { error: jsonError(err.message, err.status) };
    }
    throw err;
  }
}

export async function requireApiKey(
  req: Request,
): Promise<{ user: ApiKeyUser; error?: never } | { user?: never; error: Response }> {
  const token = extractBearerToken(req);
  if (!token) {
    return { error: jsonError("Missing or invalid Authorization header", 401) };
  }

  const keyHash = await hashApiKey(token);
  const rows = await query<{
    user_id: string;
    device_id: string;
    id: string;
  }>("SELECT id, user_id, device_id FROM api_keys WHERE key_hash = ?", [keyHash]);

  const row = rows[0];
  if (!row) {
    return { error: jsonError("Invalid API key", 401) };
  }
  const { user_id, device_id, id } = row;

  try {
    await query("UPDATE api_keys SET last_used = ? WHERE id = ?", [new Date().toISOString(), id]);
  } catch {
    // last_used is non-critical
  }

  return { user: { userId: user_id, deviceId: device_id } };
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.get("authorization");
  if (!header) return null;
  const match = header.match(/^bearer\s+(.+)$/i);
  if (!match?.[1]?.trim()) return null;
  return match[1].trim();
}

export function jsonOk(data: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headersToRecord(headers) },
  });
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers;
}

export async function getUserTimezone(userId: string): Promise<string> {
  const row = await settingsRepo.findByKey(userId, "timezone");
  if (row && isValidTimezone(row.value)) {
    return row.value;
  }
  return DEFAULT_TIMEZONE;
}
