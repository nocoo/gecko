// DELETE /api/keys/[id] — Revoke an API key

import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { query, execute } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** DELETE /api/keys/[id] — Revoke an API key by ID. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const { id } = await params;

  // Verify the key exists and belongs to this user
  const rows = await query<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM api_keys WHERE id = ?",
    [id]
  );

  if (rows.length === 0 || rows[0].user_id !== user.userId) {
    return jsonError("API key not found", 404);
  }

  await execute("DELETE FROM api_keys WHERE id = ? AND user_id = ?", [
    id,
    user.userId,
  ]);

  return jsonOk({ deleted: true });
}
