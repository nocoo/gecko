/**
 * Backy data export — collect all user data into a BackupEnvelope.
 *
 * focus_sessions is paginated (PAGE_SIZE rows per D1 query) to avoid
 * hitting response size limits. All other tables are small enough
 * for a single query per user.
 */

import {
  BACKUP_SCHEMA_VERSION,
  type BackupEnvelope,
  type BkApiKey,
  type BkAppCategoryMapping,
  type BkAppNote,
  type BkAppTagMapping,
  type BkCategory,
  type BkDailySummary,
  type BkFocusSession,
  type BkSetting,
  type BkSyncLog,
  type BkTag,
  isBackySettingKey,
} from "@/lib/backy";
import { query } from "@/lib/d1";
import { APP_VERSION } from "@/lib/version";

/** Rows per D1 query when paginating focus_sessions. */
export const PAGE_SIZE = 5000;

/**
 * Paginate through focus_sessions for a user.
 * Ordered by start_time ASC for deterministic output.
 */
async function exportSessions(userId: string): Promise<BkFocusSession[]> {
  const all: BkFocusSession[] = [];
  let offset = 0;

  while (true) {
    const page = await query<BkFocusSession>(
      `SELECT id, user_id, device_id, app_name, window_title, url,
              start_time, end_time, duration, bundle_id, tab_title,
              tab_count, document_path, is_full_screen, is_minimized, synced_at
       FROM focus_sessions
       WHERE user_id = ?
       ORDER BY start_time ASC
       LIMIT ? OFFSET ?`,
      [userId, PAGE_SIZE, offset],
    );

    all.push(...page);

    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return all;
}

/**
 * Export all user data into a BackupEnvelope.
 * Settings with backy.* prefix are excluded to avoid storing
 * backup credentials inside the backup itself.
 */
export async function exportUserData(userId: string): Promise<BackupEnvelope> {
  // Small tables can all be queried in parallel
  const [
    sessions,
    categories,
    categoryMappings,
    tags,
    tagMappings,
    appNotes,
    dailySummaries,
    allSettings,
    apiKeys,
    syncLogs,
  ] = await Promise.all([
    exportSessions(userId),
    query<BkCategory>(
      `SELECT id, user_id, title, icon, is_default, slug, created_at
       FROM categories WHERE user_id = ?`,
      [userId],
    ),
    query<BkAppCategoryMapping>(
      `SELECT user_id, bundle_id, category_id, created_at
       FROM app_category_mappings WHERE user_id = ?`,
      [userId],
    ),
    query<BkTag>(
      `SELECT id, user_id, name, created_at
       FROM tags WHERE user_id = ?`,
      [userId],
    ),
    query<BkAppTagMapping>(
      `SELECT user_id, bundle_id, tag_id, created_at
       FROM app_tag_mappings WHERE user_id = ?`,
      [userId],
    ),
    query<BkAppNote>(
      `SELECT user_id, bundle_id, note, created_at, updated_at
       FROM app_notes WHERE user_id = ?`,
      [userId],
    ),
    query<BkDailySummary>(
      `SELECT id, user_id, date, ai_score, ai_result_json, ai_model,
              ai_generated_at, created_at, updated_at
       FROM daily_summaries WHERE user_id = ?`,
      [userId],
    ),
    query<BkSetting>(
      `SELECT user_id, key, value, updated_at
       FROM settings WHERE user_id = ?`,
      [userId],
    ),
    query<BkApiKey>(
      `SELECT id, user_id, name, key_hash, device_id, created_at, last_used
       FROM api_keys WHERE user_id = ?`,
      [userId],
    ),
    query<BkSyncLog>(
      `SELECT id, user_id, device_id, session_count, first_start, last_start, synced_at
       FROM sync_logs WHERE user_id = ?`,
      [userId],
    ),
  ]);

  // Filter out backy-internal settings
  const settings = allSettings.filter((s) => !isBackySettingKey(s.key));

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    userId,
    focusSessions: sessions,
    categories,
    appCategoryMappings: categoryMappings,
    tags,
    appTagMappings: tagMappings,
    appNotes,
    dailySummaries,
    settings,
    apiKeys,
    syncLogs,
  };
}
