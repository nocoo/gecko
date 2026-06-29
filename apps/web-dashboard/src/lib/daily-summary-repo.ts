/**
 * Daily summary repository.
 *
 * CRUD for the daily_summaries table via D1 REST API.
 * Composite unique index: (user_id, date).
 * Only AI analysis results are stored here — stats are always computed fresh.
 */

import { query, execute } from "@/lib/d1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailySummaryRow {
  id: string;
  user_id: string;
  date: string;
  ai_score: number | null;
  ai_result_json: string | null;
  ai_model: string | null;
  ai_prompt: string | null;
  ai_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface DailySummaryRangeRow {
  date: string;
  ai_score: number | null;
  /** 0/1 from SQLite — true when a real AI result is cached (not a placeholder claim). */
  has_ai_result: number;
}

export const dailySummaryRepo = {
  /** Find a cached summary for a given user + date. */
  async findByUserAndDate(
    userId: string,
    date: string,
  ): Promise<DailySummaryRow | null> {
    const rows = await query<DailySummaryRow>(
      `SELECT id, user_id, date, ai_score, ai_result_json,
              ai_model, ai_prompt, ai_generated_at, created_at, updated_at
       FROM daily_summaries
       WHERE user_id = ? AND date = ?`,
      [userId, date],
    );
    return rows[0] ?? null;
  },

  /**
   * List cached summaries for a user within an inclusive date range.
   *
   * Returns only the columns needed for calendar badges. `__analyzing__`
   * placeholder rows (from {@link claimForAnalysis}) report `has_ai_result = 0`
   * so the UI doesn't paint an AI badge for an in-flight analysis.
   */
  async listByUserAndDateRange(
    userId: string,
    fromDate: string,
    toDate: string,
  ): Promise<DailySummaryRangeRow[]> {
    return query<DailySummaryRangeRow>(
      `SELECT date,
              ai_score,
              CASE
                WHEN ai_result_json IS NOT NULL AND ai_model != '__analyzing__'
                  THEN 1 ELSE 0
              END AS has_ai_result
       FROM daily_summaries
       WHERE user_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`,
      [userId, fromDate, toDate],
    );
  },

  /** Update the AI analysis result for an existing summary. */
  async upsertAiResult(
    userId: string,
    date: string,
    aiScore: number,
    aiResultJson: string,
    aiModel: string,
    aiPrompt?: string,
  ): Promise<void> {
    const id = crypto.randomUUID();
    await execute(
      `INSERT INTO daily_summaries (id, user_id, date, ai_score, ai_result_json, ai_model, ai_prompt, ai_generated_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT (user_id, date) DO UPDATE SET
         ai_score = excluded.ai_score,
         ai_result_json = excluded.ai_result_json,
         ai_model = excluded.ai_model,
         ai_prompt = excluded.ai_prompt,
         ai_generated_at = datetime('now'),
         updated_at = datetime('now')`,
      [id, userId, date, aiScore, aiResultJson, aiModel, aiPrompt ?? null],
    );
  },

  /**
   * Atomically claim a (user_id, date) slot for AI analysis.
   *
   * Inserts a placeholder row with ai_model = '__analyzing__' and
   * ai_result_json = NULL. Returns true if the claim succeeded (no
   * existing row), false if a row already exists (another process
   * claimed it or analysis is already complete).
   *
   * This prevents duplicate AI calls across concurrent processes:
   * only the process that wins the INSERT gets to call the AI provider.
   */
  async claimForAnalysis(userId: string, date: string): Promise<boolean> {
    const id = crypto.randomUUID();
    const result = await execute(
      `INSERT INTO daily_summaries (id, user_id, date, ai_model, updated_at)
       VALUES (?, ?, ?, '__analyzing__', datetime('now'))
       ON CONFLICT (user_id, date) DO NOTHING`,
      [id, userId, date],
    );
    return result.meta.changes > 0;
  },

  /**
   * Release a previously claimed analysis slot on failure.
   *
   * Deletes the placeholder row ONLY if it still has ai_model = '__analyzing__'
   * (i.e. analysis hasn't completed yet). This allows the next tick to retry.
   * Will not delete rows that have real AI results.
   */
  async releaseAnalysisClaim(userId: string, date: string): Promise<void> {
    await execute(
      `DELETE FROM daily_summaries
       WHERE user_id = ? AND date = ? AND ai_model = '__analyzing__'`,
      [userId, date],
    );
  },
};
