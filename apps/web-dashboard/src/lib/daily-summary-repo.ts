import { execute, query } from "@/lib/d1";

export interface DailySummaryRow {
  id: string;
  user_id: string;
  date: string;
  ai_score: number | null;
  ai_result_json: string | null;
  ai_model: string | null;
  ai_prompt: string | null;
  ai_generated_at: string | null;
  claim_token: string | null;
  claim_expires_at: number | null;
  created_at: string;
  updated_at: string;
}

export interface DailySummaryRangeRow {
  date: string;
  ai_score: number | null;
  has_ai_result: number;
}

export interface ClaimResult {
  claimed: boolean;
  token?: string;
  reason?: "cached" | "busy";
}

const DEFAULT_LEASE_SECONDS = 15 * 60;

export const dailySummaryRepo = {
  async findByUserAndDate(userId: string, date: string): Promise<DailySummaryRow | null> {
    const rows = await query<DailySummaryRow>(
      `SELECT id, user_id, date, ai_score, ai_result_json,
              ai_model, ai_prompt, ai_generated_at,
              claim_token, claim_expires_at, created_at, updated_at
       FROM daily_summaries
       WHERE user_id = ? AND date = ?`,
      [userId, date],
    );
    return rows[0] ?? null;
  },

  async listByUserAndDateRange(
    userId: string,
    fromDate: string,
    toDate: string,
  ): Promise<DailySummaryRangeRow[]> {
    return query<DailySummaryRangeRow>(
      `SELECT date,
              ai_score,
              CASE WHEN ai_result_json IS NOT NULL THEN 1 ELSE 0 END AS has_ai_result
       FROM daily_summaries
       WHERE user_id = ? AND date >= ? AND date <= ?
       ORDER BY date ASC`,
      [userId, fromDate, toDate],
    );
  },

  async upsertAiResult(
    userId: string,
    date: string,
    aiScore: number,
    aiResultJson: string,
    aiModel: string,
    aiPrompt?: string,
    claim?: { token: string; nowSeconds: number },
  ): Promise<void> {
    if (claim) {
      const result = await execute(
        `UPDATE daily_summaries SET
           ai_score = ?,
           ai_result_json = ?,
           ai_model = ?,
           ai_prompt = ?,
           ai_generated_at = datetime('now'),
           updated_at = datetime('now'),
           claim_token = NULL,
           claim_expires_at = NULL
         WHERE user_id = ? AND date = ? AND claim_token = ? AND claim_expires_at >= ?`,
        [
          aiScore,
          aiResultJson,
          aiModel,
          aiPrompt ?? null,
          userId,
          date,
          claim.token,
          claim.nowSeconds,
        ],
      );
      if (result.meta.changes !== 1) {
        throw new Error("analysis claim mismatch");
      }
      return;
    }
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

  async claimForAnalysis(
    userId: string,
    date: string,
    options: { force?: boolean; nowSeconds?: number; leaseSeconds?: number } = {},
  ): Promise<ClaimResult> {
    const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const leaseSeconds = options.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
    const token = crypto.randomUUID();
    const expires = nowSeconds + leaseSeconds;
    const force = options.force ? 1 : 0;

    await execute(
      `INSERT INTO daily_summaries (id, user_id, date, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT (user_id, date) DO NOTHING`,
      [crypto.randomUUID(), userId, date],
    );

    const result = await execute(
      `UPDATE daily_summaries
       SET claim_token = ?, claim_expires_at = ?, updated_at = datetime('now')
       WHERE user_id = ? AND date = ?
         AND (claim_token IS NULL OR claim_expires_at < ?)
         AND (? = 1 OR ai_result_json IS NULL)`,
      [token, expires, userId, date, nowSeconds, force],
    );
    if (result.meta.changes > 0) {
      return { claimed: true, token };
    }
    const existing = await dailySummaryRepo.findByUserAndDate(userId, date);
    if (existing?.ai_result_json && !options.force) {
      return { claimed: false, reason: "cached" };
    }
    return { claimed: false, reason: "busy" };
  },

  async releaseAnalysisClaim(userId: string, date: string, token?: string): Promise<void> {
    if (token) {
      await execute(
        `UPDATE daily_summaries
         SET claim_token = NULL, claim_expires_at = NULL, updated_at = datetime('now')
         WHERE user_id = ? AND date = ? AND claim_token = ?`,
        [userId, date, token],
      );
      return;
    }
    await execute(
      `UPDATE daily_summaries
       SET claim_token = NULL, claim_expires_at = NULL, updated_at = datetime('now')
       WHERE user_id = ? AND date = ?`,
      [userId, date],
    );
  },
};
