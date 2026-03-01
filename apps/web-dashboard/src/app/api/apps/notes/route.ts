// GET    /api/apps/notes — List all app notes for the current user
// PUT    /api/apps/notes — Upsert a note for an app (bundle_id + note)
// DELETE /api/apps/notes — Delete a note for an app (bundle_id)

import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { query, execute } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** GET /api/apps/notes */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const rows = await query<{
    bundle_id: string;
    note: string;
    updated_at: string;
  }>(
    `SELECT bundle_id, note, updated_at
     FROM app_notes
     WHERE user_id = ?
     ORDER BY updated_at DESC`,
    [user.userId],
  );

  return jsonOk({
    notes: rows.map((row) => ({
      bundleId: row.bundle_id,
      note: row.note,
      updatedAt: row.updated_at,
    })),
  });
}

interface NoteBody {
  bundleId?: string;
  note?: string;
}

/** PUT /api/apps/notes — Upsert a note for an app. */
export async function PUT(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: NoteBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const bundleId = body.bundleId?.trim();
  if (!bundleId) {
    return jsonError("bundleId is required", 400);
  }

  const note = body.note?.trim() ?? "";
  if (note.length > 500) {
    return jsonError("Note must be 500 characters or fewer", 400);
  }

  // If note is empty, delete the record instead of storing blank data
  if (note.length === 0) {
    await execute(
      "DELETE FROM app_notes WHERE user_id = ? AND bundle_id = ?",
      [user.userId, bundleId],
    );
    return jsonOk({ bundleId, note: "", deleted: true });
  }

  await execute(
    `INSERT INTO app_notes (user_id, bundle_id, note, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT (user_id, bundle_id)
     DO UPDATE SET note = excluded.note, updated_at = datetime('now')`,
    [user.userId, bundleId, note],
  );

  return jsonOk({ bundleId, note });
}

/** DELETE /api/apps/notes — Delete a note for an app. */
export async function DELETE(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { bundleId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const bundleId = body.bundleId?.trim();
  if (!bundleId) {
    return jsonError("bundleId is required", 400);
  }

  const result = await execute(
    "DELETE FROM app_notes WHERE user_id = ? AND bundle_id = ?",
    [user.userId, bundleId],
  );

  return jsonOk({ deleted: result.meta.changes > 0 });
}
