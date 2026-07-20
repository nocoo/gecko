/**
 * Backy configuration repository.
 *
 * Stores backy push/pull config in the existing `settings` table as
 * key-value pairs scoped per user. No migration needed.
 *
 * Keys:
 *   backy.webhookUrl  — Backy service Webhook URL (push target)
 *   backy.apiKey      — Backy service API key (push auth)
 *   backy.pullKey     — Pull webhook key (for Backy to call us)
 */

import { execute, query } from "@/lib/d1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackyPushConfig {
  webhookUrl: string;
  apiKey: string;
}

export interface BackyPullKeyRow {
  user_id: string;
  key: string;
  value: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const backyRepo = {
  // ---- Push config ----

  /** Get the push config for a user, or null if not configured. */
  async getPushConfig(userId: string): Promise<BackyPushConfig | null> {
    const rows = await query<{ key: string; value: string }>(
      `SELECT key, value FROM settings
       WHERE user_id = ? AND key IN ('backy.webhookUrl', 'backy.apiKey')`,
      [userId],
    );

    const map = new Map(rows.map((r) => [r.key, r.value]));
    const webhookUrl = map.get("backy.webhookUrl");
    const apiKey = map.get("backy.apiKey");

    if (!webhookUrl || !apiKey) return null;
    return { webhookUrl, apiKey };
  },

  /** Save (upsert) the push config. */
  async savePushConfig(userId: string, webhookUrl: string, apiKey: string): Promise<void> {
    const now = Date.now();
    // Two upserts — simple and clear
    await execute(
      `INSERT INTO settings (user_id, key, value, updated_at)
       VALUES (?, 'backy.webhookUrl', ?, ?)
       ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, webhookUrl, now],
    );
    await execute(
      `INSERT INTO settings (user_id, key, value, updated_at)
       VALUES (?, 'backy.apiKey', ?, ?)
       ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, apiKey, now],
    );
  },

  // ---- Pull key ----

  /** Get the pull key for a user, or null if not set. */
  async getPullKey(userId: string): Promise<string | null> {
    const rows = await query<{ value: string }>(
      `SELECT value FROM settings WHERE user_id = ? AND key = 'backy.pullKey'`,
      [userId],
    );
    return rows[0]?.value ?? null;
  },

  /** Save (upsert) a pull key. */
  async savePullKey(userId: string, key: string): Promise<void> {
    await execute(
      `INSERT INTO settings (user_id, key, value, updated_at)
       VALUES (?, 'backy.pullKey', ?, ?)
       ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, key, Date.now()],
    );
  },

  /** Delete the pull key (revoke). Returns true if a key existed. */
  async deletePullKey(userId: string): Promise<boolean> {
    const result = await execute(
      `DELETE FROM settings WHERE user_id = ? AND key = 'backy.pullKey'`,
      [userId],
    );
    return result.meta.changes > 0;
  },

  /**
   * Find the user who owns a given pull key.
   * Returns the user_id or null if no match.
   * Used by the pull webhook endpoint to authenticate incoming requests.
   */
  async findUserByPullKey(pullKey: string): Promise<string | null> {
    const rows = await query<{ user_id: string }>(
      `SELECT user_id FROM settings WHERE key = 'backy.pullKey' AND value = ?`,
      [pullKey],
    );
    return rows[0]?.user_id ?? null;
  },

  /** Generate a cryptographically secure pull key. */
  generatePullKey(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return `bpk_${hex}`;
  },
};
