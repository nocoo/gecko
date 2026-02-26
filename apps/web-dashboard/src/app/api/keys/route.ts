// POST /api/keys — Generate a new API key
// GET  /api/keys — List current user's API keys

import { randomUUID } from "node:crypto";
import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { generateApiKey, hashApiKey } from "@/lib/api-key";
import { query, execute } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** POST /api/keys — Generate a new API key for a device. */
export async function POST(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const name = body.name?.trim();
  if (!name) {
    return jsonError("name is required", 400);
  }

  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyId = randomUUID();
  const deviceId = randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO api_keys (id, user_id, name, key_hash, device_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [keyId, user.userId, name, keyHash, deviceId, now]
  );

  return jsonOk(
    {
      id: keyId,
      key: rawKey,
      deviceId,
      name,
      createdAt: now,
    },
    201
  );
}

/** GET /api/keys — List current user's API keys (without hashes). */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const rows = await query<{
    id: string;
    name: string;
    device_id: string;
    created_at: string;
    last_used: string | null;
  }>(
    `SELECT id, name, device_id, created_at, last_used
     FROM api_keys WHERE user_id = ? ORDER BY created_at DESC`,
    [user.userId]
  );

  return jsonOk({
    keys: rows.map((row) => ({
      id: row.id,
      name: row.name,
      deviceId: row.device_id,
      createdAt: row.created_at,
      lastUsed: row.last_used,
    })),
  });
}
