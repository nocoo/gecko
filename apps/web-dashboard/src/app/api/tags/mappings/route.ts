// GET /api/tags/mappings — List app->tag mappings for the current user
// PUT /api/tags/mappings — Set app->tag mappings (upsert)

import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { query, execute } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** GET /api/tags/mappings */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const rows = await query<{
    bundle_id: string;
    tag_id: string;
    created_at: string;
  }>(
    `SELECT bundle_id, tag_id, created_at
     FROM app_tag_mappings WHERE user_id = ? ORDER BY bundle_id, tag_id`,
    [user.userId],
  );

  return jsonOk({
    mappings: rows.map((row) => ({
      bundleId: row.bundle_id,
      tagId: row.tag_id,
      createdAt: row.created_at,
    })),
  });
}

interface TagMappingEntry {
  bundleId?: string;
  tagId?: string;
}

/** PUT /api/tags/mappings — Upsert a batch of app->tag mappings. */
export async function PUT(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  let body: { mappings?: TagMappingEntry[] };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!Array.isArray(body.mappings) || body.mappings.length === 0) {
    return jsonError("mappings array is required", 400);
  }

  for (const m of body.mappings) {
    if (!m.bundleId?.trim() || !m.tagId?.trim()) {
      return jsonError("Each mapping must have bundleId and tagId", 400);
    }
  }

  // D1 has a 100 bind param limit. Each upsert uses 3 params.
  // Process in batches of 33 (33 * 3 = 99 < 100).
  const BATCH_SIZE = 33;
  const mappings = body.mappings as Required<TagMappingEntry>[];
  let upserted = 0;

  for (let i = 0; i < mappings.length; i += BATCH_SIZE) {
    const batch = mappings.slice(i, i + BATCH_SIZE);
    const placeholders = batch
      .map(() => "(?, ?, ?, datetime('now'))")
      .join(", ");
    const params = batch.flatMap((m) => [
      user.userId,
      m.bundleId.trim(),
      m.tagId.trim(),
    ]);

    await execute(
      `INSERT OR REPLACE INTO app_tag_mappings (user_id, bundle_id, tag_id, created_at)
       VALUES ${placeholders}`,
      params,
    );

    upserted += batch.length;
  }

  return jsonOk({ upserted });
}
