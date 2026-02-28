/**
 * Settings repository.
 *
 * Key-value CRUD for the settings table, scoped per user.
 * Uses the D1 REST API client (no ORM).
 * Composite primary key: (user_id, key).
 */

import { query, execute } from "@/lib/d1";

export interface DbSetting {
  user_id: string;
  key: string;
  value: string;
  updated_at: number;
}

export const settingsRepo = {
  async findByUserId(userId: string): Promise<DbSetting[]> {
    return query<DbSetting>(
      "SELECT user_id, key, value, updated_at FROM settings WHERE user_id = ?",
      [userId],
    );
  },

  async findByKey(userId: string, key: string): Promise<DbSetting | undefined> {
    const rows = await query<DbSetting>(
      "SELECT user_id, key, value, updated_at FROM settings WHERE user_id = ? AND key = ?",
      [userId, key],
    );
    return rows[0];
  },

  /**
   * Set a setting value. Creates or updates the entry.
   * Uses INSERT OR REPLACE (SQLite UPSERT).
   */
  async upsert(userId: string, key: string, value: string): Promise<void> {
    await execute(
      `INSERT INTO settings (user_id, key, value, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [userId, key, value, Date.now()],
    );
  },

  async delete(userId: string, key: string): Promise<boolean> {
    const result = await execute(
      "DELETE FROM settings WHERE user_id = ? AND key = ?",
      [userId, key],
    );
    return result.meta.changes > 0;
  },

  async deleteByUserId(userId: string): Promise<number> {
    const result = await execute(
      "DELETE FROM settings WHERE user_id = ?",
      [userId],
    );
    return result.meta.changes;
  },
};
