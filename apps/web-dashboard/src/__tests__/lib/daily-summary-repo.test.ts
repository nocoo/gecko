/**
 * Tests for daily-summary-repo.ts — CRUD via D1 REST API.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockD1(responses: Array<{ results: unknown[]; meta?: { changes: number } }>) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    const resp = responses[callIndex] ?? { results: [], meta: { changes: 0 } };
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              results: resp.results,
              success: true,
              meta: resp.meta ?? { changes: 0, last_row_id: 0 },
            },
          ],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

// ---------------------------------------------------------------------------
// findByUserAndDate
// ---------------------------------------------------------------------------

describe("dailySummaryRepo.findByUserAndDate", () => {
  test("returns null when no row found", async () => {
    mockD1([{ results: [] }]);
    const result = await dailySummaryRepo.findByUserAndDate("u1", "2026-02-27");
    expect(result).toBeNull();
  });

  test("returns the row when found", async () => {
    const row = {
      id: "sum-1",
      user_id: "u1",
      date: "2026-02-27",
      ai_score: 75,
      ai_result_json: '{"score":75}',
      ai_model: "test-model",
      ai_prompt: null,
      ai_generated_at: "2026-02-28T00:00:00Z",
      created_at: "2026-02-27T00:00:00Z",
      updated_at: "2026-02-28T00:00:00Z",
    };
    const { calls } = mockD1([{ results: [row] }]);
    const result = await dailySummaryRepo.findByUserAndDate("u1", "2026-02-27");

    expect(result).not.toBeNull();
    if (!result) return;
    expect(result).toEqual(row);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("daily_summaries");
    expect(c0.params).toEqual(["u1", "2026-02-27"]);
  });
});

// ---------------------------------------------------------------------------
// upsertAiResult
// ---------------------------------------------------------------------------

describe("dailySummaryRepo.upsertAiResult", () => {
  test("executes INSERT with ON CONFLICT", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);

    await dailySummaryRepo.upsertAiResult(
      "u1",
      "2026-02-27",
      80,
      '{"score":80}',
      "claude-sonnet-4-20250514",
    );

    expect(calls).toHaveLength(1);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("INSERT INTO daily_summaries");
    expect(c0.sql).toContain("ON CONFLICT");
    // Params: id, userId, date, aiScore, aiResultJson, aiModel
    expect(c0.params[1]).toBe("u1");
    expect(c0.params[2]).toBe("2026-02-27");
    expect(c0.params[3]).toBe(80);
    expect(c0.params[4]).toBe('{"score":80}');
    expect(c0.params[5]).toBe("claude-sonnet-4-20250514");
  });
});

// ---------------------------------------------------------------------------
// claimForAnalysis
// ---------------------------------------------------------------------------

describe("dailySummaryRepo.claimForAnalysis", () => {
  test("returns true when claim succeeds (no existing row)", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
    const claimed = await dailySummaryRepo.claimForAnalysis("u1", "2026-03-30");

    expect(claimed).toBe(true);
    expect(calls).toHaveLength(1);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("INSERT INTO daily_summaries");
    expect(c0.sql).toContain("ON CONFLICT");
    expect(c0.sql).toContain("DO NOTHING");
    expect(c0.sql).toContain("__analyzing__");
    expect(c0.params[1]).toBe("u1");
    expect(c0.params[2]).toBe("2026-03-30");
  });

  test("returns false when another process already claimed it", async () => {
    mockD1([{ results: [], meta: { changes: 0 } }]);
    const claimed = await dailySummaryRepo.claimForAnalysis("u1", "2026-03-30");

    expect(claimed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// releaseAnalysisClaim
// ---------------------------------------------------------------------------

describe("dailySummaryRepo.releaseAnalysisClaim", () => {
  test("deletes placeholder row with __analyzing__ sentinel", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
    await dailySummaryRepo.releaseAnalysisClaim("u1", "2026-03-30");

    expect(calls).toHaveLength(1);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("DELETE FROM daily_summaries");
    expect(c0.sql).toContain("__analyzing__");
    expect(c0.params).toEqual(["u1", "2026-03-30"]);
  });
});
