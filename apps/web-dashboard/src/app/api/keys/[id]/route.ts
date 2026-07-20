// PATCH  /api/keys/[id] — Rename an API key
// DELETE /api/keys/[id] — Revoke an API key

import { jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { execute, query } from "@/lib/d1";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Verify the key exists and belongs to the authenticated user. */
async function findOwnedKey(
  keyId: string,
  userId: string,
): Promise<{ id: string; user_id: string } | null> {
  const rows = await query<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM api_keys WHERE id = ?",
    [keyId],
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (!row || row.user_id !== userId) return null;
  return row;
}

// ---------------------------------------------------------------------------
// PATCH /api/keys/[id] — Rename an API key
// ---------------------------------------------------------------------------

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const { id } = await params;

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

  const key = await findOwnedKey(id, user.userId);
  if (!key) {
    return jsonError("API key not found", 404);
  }

  await execute("UPDATE api_keys SET name = ? WHERE id = ? AND user_id = ?", [
    name,
    id,
    user.userId,
  ]);

  return jsonOk({ id, name });
}

// ---------------------------------------------------------------------------
// DELETE /api/keys/[id] — Revoke an API key
// ---------------------------------------------------------------------------

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  const key = await findOwnedKey(id, user.userId);
  if (!key) {
    return jsonError("API key not found", 404);
  }

  await execute("DELETE FROM api_keys WHERE id = ? AND user_id = ?", [id, user.userId]);

  return jsonOk({ deleted: true });
}
