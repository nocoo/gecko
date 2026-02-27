// Seed default categories and bundle_id auto-mappings for a new user.
// Called from GET /api/categories when a user has zero categories.

import { randomUUID } from "node:crypto";
import { query, execute } from "@/lib/d1";
import { DEFAULT_CATEGORIES, BUNDLE_ID_MAPPINGS } from "@/lib/default-categories";

/**
 * Check if a user already has categories. If not, seed the 4 defaults
 * and auto-map known bundle_ids.
 *
 * This is idempotent — if the user already has ≥1 category, it's a no-op.
 * Returns `true` if seeding was performed, `false` if skipped.
 */
export async function seedDefaultCategories(userId: string): Promise<boolean> {
  // Quick check: does the user already have any categories?
  const existing = await query<{ cnt: number }>(
    "SELECT COUNT(*) as cnt FROM categories WHERE user_id = ?",
    [userId],
  );

  if (existing[0]?.cnt > 0) {
    return false;
  }

  // ── Step 1: Insert the 4 default categories ──
  // D1 limit: 100 params. 4 categories × 6 params = 24 — well within limits.
  const now = new Date().toISOString();
  const categoryIdBySlug = new Map<string, string>();

  for (const cat of DEFAULT_CATEGORIES) {
    const id = randomUUID();
    categoryIdBySlug.set(cat.slug, id);
  }

  const catPlaceholders = DEFAULT_CATEGORIES.map(
    () => "(?, ?, ?, ?, 1, ?, ?)",
  ).join(", ");
  const catParams = DEFAULT_CATEGORIES.flatMap((cat) => [
    categoryIdBySlug.get(cat.slug)!,
    userId,
    cat.title,
    cat.icon,
    cat.slug,
    now,
  ]);

  await execute(
    `INSERT INTO categories (id, user_id, title, icon, is_default, slug, created_at)
     VALUES ${catPlaceholders}`,
    catParams,
  );

  // ── Step 2: Auto-map known bundle_ids ──
  // Build mapping entries: only for bundle_ids whose category slug exists.
  const mappingEntries: Array<{ bundleId: string; categoryId: string }> = [];
  for (const [bundleId, slug] of BUNDLE_ID_MAPPINGS) {
    const categoryId = categoryIdBySlug.get(slug);
    if (categoryId) {
      mappingEntries.push({ bundleId, categoryId });
    }
  }

  if (mappingEntries.length === 0) {
    return true;
  }

  // Batch insert: 3 params per row (user_id, bundle_id, category_id) + datetime('now') in SQL.
  // Batch size 25 → 75 params < 100.
  const BATCH_SIZE = 25;
  for (let i = 0; i < mappingEntries.length; i += BATCH_SIZE) {
    const batch = mappingEntries.slice(i, i + BATCH_SIZE);
    const placeholders = batch
      .map(() => "(?, ?, ?, datetime('now'))")
      .join(", ");
    const params = batch.flatMap((m) => [userId, m.bundleId, m.categoryId]);

    await execute(
      `INSERT OR IGNORE INTO app_category_mappings (user_id, bundle_id, category_id, created_at)
       VALUES ${placeholders}`,
      params,
    );
  }

  return true;
}
