/**
 * Daily summary repository.
 *
 * CRUD for the daily_summaries table via D1 REST API.
 * Composite unique index: (user_id, date).
 */

import { query, execute } from "@/lib/d1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailySummaryRow {
  id: string;
  user_id: string;
  date: string;
  stats_json: string;
  ai_score: number | null;
  ai_result_json: string | null;
  ai_model: string | null;
  ai_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export const dailySummaryRepo = {
  /** Find a cached summary for a given user + date. */
  async findByUserAndDate(
    userId: string,
    date: string,
  ): Promise<DailySummaryRow | null> {
    const rows = await query<DailySummaryRow>(
      `SELECT id, user_id, date, stats_json, ai_score, ai_result_json,
              ai_model, ai_generated_at, created_at, updated_at
       FROM daily_summaries
       WHERE user_id = ? AND date = ?`,
      [userId, date],
    );
    return rows[0] ?? null;
  },

  /** Update the AI analysis result for an existing summary. */
  async upsertAiResult(
    userId: string,
    date: string,
    aiScore: number,
    aiResultJson: string,
    aiModel: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO daily_summaries (id, user_id, date, stats_json, ai_score, ai_result_json, ai_model, ai_generated_at, updated_at)
       VALUES (?, ?, ?, '{}', ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT (user_id, date) DO UPDATE SET
         ai_score = excluded.ai_score,
         ai_result_json = excluded.ai_result_json,
         ai_model = excluded.ai_model,
         ai_generated_at = datetime('now'),
         updated_at = datetime('now')`,
      [id, userId, date, aiScore, aiResultJson, aiModel],
    );
  },
};
