// GET    /api/tags — List user's tags
// POST   /api/tags — Create a tag
// PUT    /api/tags — Rename a tag
// DELETE /api/tags — Delete a tag

import { randomUUID } from "node:crypto";
import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { query, execute } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** GET /api/tags */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const rows = await query<{
    id: string;
    name: string;
    created_at: string;
  }>(
    `SELECT id, name, created_at
     FROM tags WHERE user_id = ? ORDER BY created_at ASC`,
    [user.userId],
  );

  return jsonOk({
    tags: rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    })),
  });
}

/** POST /api/tags */
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

  const id = randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO tags (id, user_id, name, created_at)
     VALUES (?, ?, ?, ?)`,
    [id, user.userId, name, now],
  );

  return jsonOk({ id, name, createdAt: now }, 201);
}

/** PUT /api/tags */
export async function PUT(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { id?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const id = body.id?.trim();
  if (!id) {
    return jsonError("id is required", 400);
  }

  const name = body.name?.trim();
  if (!name) {
    return jsonError("name is required", 400);
  }

  // Check ownership
  const rows = await query<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM tags WHERE id = ?",
    [id],
  );

  if (rows.length === 0 || rows[0].user_id !== user.userId) {
    return jsonError("Tag not found", 404);
  }

  await execute("UPDATE tags SET name = ? WHERE id = ?", [name, id]);

  return jsonOk({ id, name });
}

/** DELETE /api/tags */
export async function DELETE(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const id = body.id?.trim();
  if (!id) {
    return jsonError("id is required", 400);
  }

  // Check ownership
  const rows = await query<{ id: string; user_id: string }>(
    "SELECT id, user_id FROM tags WHERE id = ?",
    [id],
  );

  if (rows.length === 0 || rows[0].user_id !== user.userId) {
    return jsonError("Tag not found", 404);
  }

  // Remove tag mappings first, then the tag
  await execute("DELETE FROM app_tag_mappings WHERE tag_id = ?", [id]);
  await execute("DELETE FROM tags WHERE id = ?", [id]);

  return jsonOk({ deleted: true });
}
