/**
 * Tests for daily-summary-repo.ts — CRUD via D1 REST API.
 */

import { describe, expect, test } from "vitest";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { mockD1 } from "../test-env";

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

  test("throws when a claim-scoped upsert does not match", async () => {
    mockD1([{ results: [], meta: { changes: 0 } }]);
    await expect(
      dailySummaryRepo.upsertAiResult("u1", "2026-02-27", 80, '{"score":80}', "m", undefined, {
        token: "tok",
        nowSeconds: 1,
      }),
    ).rejects.toThrow("analysis claim mismatch");
  });
});

// ---------------------------------------------------------------------------
// claimForAnalysis
// ---------------------------------------------------------------------------

describe("dailySummaryRepo.claimForAnalysis", () => {
  test("returns claimed=true when the lease update succeeds", async () => {
    const { calls } = mockD1([
      { results: [], meta: { changes: 1 } },
      { results: [], meta: { changes: 1 } },
    ]);
    const claimed = await dailySummaryRepo.claimForAnalysis("u1", "2026-03-30");

    expect(claimed).toEqual({ claimed: true, token: expect.any(String) });
    expect(calls).toHaveLength(2);
    const c0 = calls[0];
    const c1 = calls[1];
    if (!c0 || !c1) return;
    expect(c0.sql).toContain("INSERT INTO daily_summaries");
    expect(c0.sql).toContain("ON CONFLICT");
    expect(c0.sql).toContain("DO NOTHING");
    expect(c0.params[1]).toBe("u1");
    expect(c0.params[2]).toBe("2026-03-30");
    expect(c1.sql).toContain("claim_token");
  });

  test("returns busy when another process already claimed it", async () => {
    mockD1([
      { results: [], meta: { changes: 0 } },
      { results: [], meta: { changes: 0 } },
      [{ ai_result_json: null }],
    ]);
    const claimed = await dailySummaryRepo.claimForAnalysis("u1", "2026-03-30");

    expect(claimed).toEqual({ claimed: false, reason: "busy" });
  });

  test("returns cached when a result already exists", async () => {
    mockD1([
      { results: [], meta: { changes: 0 } },
      { results: [], meta: { changes: 0 } },
      [{ ai_result_json: '{"score":1}' }],
    ]);
    const claimed = await dailySummaryRepo.claimForAnalysis("u1", "2026-03-30");

    expect(claimed).toEqual({ claimed: false, reason: "cached" });
  });
});

// ---------------------------------------------------------------------------
// releaseAnalysisClaim
// ---------------------------------------------------------------------------

describe("dailySummaryRepo.releaseAnalysisClaim", () => {
  test("clears claim columns for the date", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
    await dailySummaryRepo.releaseAnalysisClaim("u1", "2026-03-30");

    expect(calls).toHaveLength(1);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("UPDATE daily_summaries");
    expect(c0.sql).toContain("claim_token = NULL");
    expect(c0.params).toEqual(["u1", "2026-03-30"]);
  });

  test("scopes the release to the claim token when provided", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
    await dailySummaryRepo.releaseAnalysisClaim("u1", "2026-03-30", "tok");

    expect(calls[0]?.params).toEqual(["u1", "2026-03-30", "tok"]);
  });
});
