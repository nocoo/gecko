// GET /api/categories/mappings — List app->category mappings for the current user
// PUT /api/categories/mappings — Set app->category mappings (upsert)

import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { query, execute } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** GET /api/categories/mappings */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
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
  const { user, error } = await requireSession();
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
    if (!m.bundleId?.trim() || !m.categoryId?.trim()) {
      return jsonError(
        "Each mapping must have bundleId and categoryId",
        400,
      );
    }
  }

  // D1 has a 100 bind param limit. Each upsert uses 4 params.
  // Process in batches of 25 (25 * 4 = 100).
  const BATCH_SIZE = 25;
  const mappings = body.mappings as Required<MappingEntry>[];
  let upserted = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => "(?, ?, ?, datetime('now'))").join(", ");
    const params = batch.flatMap((m) => [
      user.userId,
      m.bundleId.trim(),
      m.categoryId.trim(),
    ]);

    await execute(
      `INSERT OR REPLACE INTO app_category_mappings (user_id, bundle_id, category_id, created_at)
       VALUES ${placeholders}`,
      params,
    );

    upserted += batch.length;
  }

  return jsonOk({ upserted });
}
