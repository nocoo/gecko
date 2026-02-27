// GET    /api/categories — List user's categories
// POST   /api/categories — Create a custom category
// PUT    /api/categories — Update a custom category
// DELETE /api/categories — Delete a custom category

import { randomUUID } from "node:crypto";
import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { query, execute } from "@/lib/d1";
import { seedDefaultCategories } from "@/lib/seed-categories";

export const dynamic = "force-dynamic";

/** Slugify a title: lowercase, trim, replace spaces/special chars with hyphens. */
function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** GET /api/categories */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  // Seed defaults on first access (idempotent — no-op if already seeded).
  await seedDefaultCategories(user.userId);

  const rows = await query<{
    id: string;
    title: string;
    icon: string;
    is_default: number;
    slug: string;
    created_at: string;
  }>(
    `SELECT id, title, icon, is_default, slug, created_at
     FROM categories WHERE user_id = ? ORDER BY is_default DESC, created_at ASC`,
    [user.userId],
  );

  return jsonOk({
    categories: rows.map((row) => ({
      id: row.id,
      title: row.title,
      icon: row.icon,
      isDefault: row.is_default === 1,
      slug: row.slug,
      createdAt: row.created_at,
    })),
  });
}

/** POST /api/categories */
export async function POST(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { title?: string; icon?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const title = body.title?.trim();
  if (!title) {
    return jsonError("title is required", 400);
  }

  const icon = body.icon?.trim() || "folder";
  const slug = slugify(title);
  const id = randomUUID();
  const now = new Date().toISOString();

  await execute(
    `INSERT INTO categories (id, user_id, title, icon, is_default, slug, created_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
    [id, user.userId, title, icon, slug, now],
  );

  return jsonOk(
    { id, title, icon, isDefault: false, slug, createdAt: now },
    201,
  );
}

/** PUT /api/categories */
export async function PUT(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { id?: string; title?: string; icon?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const id = body.id?.trim();
  if (!id) {
    return jsonError("id is required", 400);
  }

  // Check ownership and default status
  const rows = await query<{
    id: string;
    user_id: string;
    is_default: number;
  }>("SELECT id, user_id, is_default FROM categories WHERE id = ?", [id]);

  if (rows.length === 0 || rows[0].user_id !== user.userId) {
    return jsonError("Category not found", 404);
  }

  if (rows[0].is_default === 1) {
    return jsonError("Cannot edit default categories", 403);
  }

  const title = body.title?.trim();
  const icon = body.icon?.trim();

  const updates: string[] = [];
  const params: unknown[] = [];

  if (title) {
    updates.push("title = ?", "slug = ?");
    params.push(title, slugify(title));
  }
  if (icon) {
    updates.push("icon = ?");
    params.push(icon);
  }

  if (updates.length === 0) {
    return jsonError("No fields to update", 400);
  }

  params.push(id);
  await execute(
    `UPDATE categories SET ${updates.join(", ")} WHERE id = ?`,
    params,
  );

  return jsonOk({
    id,
    title: title ?? undefined,
    icon: icon ?? undefined,
  });
}

/** DELETE /api/categories */
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

  // Check ownership and default status
  const rows = await query<{
    id: string;
    user_id: string;
    is_default: number;
  }>("SELECT id, user_id, is_default FROM categories WHERE id = ?", [id]);

  if (rows.length === 0 || rows[0].user_id !== user.userId) {
    return jsonError("Category not found", 404);
  }

  if (rows[0].is_default === 1) {
    return jsonError("Cannot delete default categories", 403);
  }

  // Remove app mappings first, then the category
  await execute("DELETE FROM app_category_mappings WHERE category_id = ?", [
    id,
  ]);
  await execute("DELETE FROM categories WHERE id = ?", [id]);

  return jsonOk({ deleted: true });
}
