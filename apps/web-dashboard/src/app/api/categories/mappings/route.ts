// GET /api/categories/mappings — List app->category mappings for the current user
// PUT /api/categories/mappings — Set app->category mappings (upsert)

import { jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { execute, query } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** GET /api/categories/mappings */
export async function GET(req: Request): Promise<Response> {
  const { user, error } = await requireSession(req);
  if (error) return error;

  const rows = await query<{
    bundle_id: string;
    category_id: string;
    created_at: string;
  }>(
    `SELECT bundle_id, category_id, created_at
     FROM app_category_mappings WHERE user_id = ? ORDER BY bundle_id`,
    [user.userId],
  );

  return jsonOk({
    mappings: rows.map((row) => ({
      bundleId: row.bundle_id,
      categoryId: row.category_id,
      createdAt: row.created_at,
    })),
  });
}

interface MappingEntry {
  bundleId?: string;
  categoryId?: string;
}

/** PUT /api/categories/mappings — Upsert a batch of app->category mappings. */
export async function PUT(req: Request): Promise<Response> {
  const { user, error } = await requireSession(req);
  if (error) return error;

  let body: { mappings?: MappingEntry[] };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!Array.isArray(body.mappings) || body.mappings.length === 0) {
    return jsonError("mappings array is required", 400);
  }

  // Validate each entry
  for (const m of body.mappings) {
    if (typeof m?.bundleId !== "string" || !m.bundleId.trim() || typeof m.categoryId !== "string") {
      return jsonError("Each mapping must have bundleId and categoryId", 400);
    }
  }

  // Keep only the final assignment for each app, including explicit removals.
  const latest = new Map(
    (body.mappings as Required<MappingEntry>[]).map((m) => [
      m.bundleId.trim(),
      m.categoryId.trim(),
    ]),
  );
  const mappings: Required<MappingEntry>[] = [];
  for (const [bundleId, categoryId] of latest) {
    if (categoryId) {
      mappings.push({ bundleId, categoryId });
    } else {
      await execute("DELETE FROM app_category_mappings WHERE user_id = ? AND bundle_id = ?", [
        user.userId,
        bundleId,
      ]);
    }
  }

  const BATCH_SIZE = 25;
  let upserted = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, datetime('now'))").join(", ");
    const params = batch.flatMap((m) => [user.userId, m.bundleId.trim(), m.categoryId.trim()]);

    await execute(
      `INSERT OR REPLACE INTO app_category_mappings (user_id, bundle_id, category_id, created_at)
       VALUES ${placeholders}`,
      params,
    );

    upserted += batch.length;
  }

  return jsonOk({ upserted });
}
