/**
 * Route-level tests for POST /api/daily/[date]/analyze.
 *
 * Stats are always computed fresh from D1 (the daily_summaries table
 * only caches AI results). AI generation itself is not tested here
 * (requires mocking generateText); pure-function coverage is in
 * daily-analyze.test.ts.
 */

import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// D1 mock helper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Timezone settings row mock for Asia/Shanghai. */
const tzRow = {
  user_id: "e2e-test-user",
  key: "timezone",
  value: "Asia/Shanghai",
  updated_at: Date.now(),
};

/** A cached AI result row. */
const cachedAiRow = {
  id: "sum-1",
  user_id: "e2e-test-user",
  date: "2026-02-27",
  ai_score: 75,
  ai_result_json: JSON.stringify({
    score: 75,
    highlights: ["Good focus"],
    improvements: ["Take breaks"],
    timeSegments: [],
    summary: "Good day.",
  }),
  ai_model: "test-model",
  ai_generated_at: "2026-02-28T00:00:00Z",
  created_at: "2026-02-28T00:00:00Z",
  updated_at: "2026-02-28T00:00:00Z",
};

/** AI settings rows mock. */
const aiSettingsRows = [
  { user_id: "e2e-test-user", key: "ai.provider", value: "anthropic", updated_at: Date.now() },
  { user_id: "e2e-test-user", key: "ai.apiKey", value: "sk-test-key", updated_at: Date.now() },
  {
    user_id: "e2e-test-user",
    key: "ai.model",
    value: "claude-sonnet-4-20250514",
    updated_at: Date.now(),
  },
];

function makeAnalyzeRequest(date: string, force = false): Request {
  const url = force ? `/api/daily/${date}/analyze?force=true` : `/api/daily/${date}/analyze`;
  return humanRequest(url, { method: "POST" });
}

async function callPOST(req: Request, date: string): Promise<Response> {
  const { POST } = await import("../../app/api/daily/[date]/analyze/route");
  return POST(req, { params: Promise.resolve({ date }) });
}

const claimWrites = [
  { results: [], meta: { changes: 1 } },
  { results: [], meta: { changes: 1 } },
];
const upsertOk = { results: [], meta: { changes: 1 } };
const sampleSession = {
  id: "s1",
  app_name: "VSCode",
  bundle_id: "com.microsoft.VSCode",
  window_title: "test.ts",
  url: null,
  start_time: 1772157600,
  duration: 3600,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/daily/[date]/analyze", () => {
  test("returns cached AI result when available", async () => {
    mockD1([
      // 1. getUserTimezone
      [tzRow],
      // 2. dailySummaryRepo.findByUserAndDate
      [cachedAiRow],
    ]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-27"), "2026-02-27");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.cached).toBe(true);
    expect(data.score).toBe(75);
    expect(data.result.highlights).toEqual(["Good focus"]);
    expect(data.model).toBe("test-model");
  });

  test("returns 400 for invalid date format", async () => {
    mockD1([
      // 1. getUserTimezone
      [tzRow],
    ]);

    const res = await callPOST(makeAnalyzeRequest("not-a-date"), "not-a-date");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Invalid date format");
  });

  test("returns 400 for future date", async () => {
    mockD1([
      // 1. getUserTimezone
      [tzRow],
    ]);

    const res = await callPOST(makeAnalyzeRequest("2099-12-31"), "2099-12-31");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Cannot analyze future dates");
  });

  test("returns 400 when no sessions found for date", async () => {
    mockD1([[tzRow], [], ...claimWrites, aiSettingsRows, []]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-20"), "2026-02-20");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("No sessions found");
  });

  test("returns 400 when AI settings not configured", async () => {
    mockD1([[tzRow], [], ...claimWrites, []]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-20"), "2026-02-20");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("AI provider and API key must be configured");
  });

  test("force=true skips AI cache check", async () => {
    const { calls } = mockD1([
      [tzRow],
      ...claimWrites,
      aiSettingsRows,
      [sampleSession],
      [],
      [],
      [],
    ]);

    await callPOST(makeAnalyzeRequest("2026-02-27", true), "2026-02-27");
    const cacheSelects = calls.filter(
      (c) => c.sql.includes("daily_summaries") && c.sql.trim().toUpperCase().startsWith("SELECT"),
    );
    expect(cacheSelects).toHaveLength(0);
    expect(calls.some((c) => c.sql.includes("INSERT INTO daily_summaries"))).toBe(true);
  });

  test("queries sessions with timezone-aware day boundaries", async () => {
    const { calls } = mockD1([
      [tzRow],
      [],
      ...claimWrites,
      aiSettingsRows,
      [sampleSession],
      [],
      [],
      [],
    ]);

    // Will fail at AI call, that's fine
    await callPOST(makeAnalyzeRequest("2026-02-27"), "2026-02-27");

    // Find the focus_sessions query
    const sessionQuery = calls.find((c) => c.sql.includes("focus_sessions"));
    expect(sessionQuery).toBeDefined();
    expect(sessionQuery!.sql).toContain("start_time >= ?");
    expect(sessionQuery!.sql).toContain("start_time < ?");
    // Cross-midnight clause
    expect(sessionQuery!.sql).toContain("start_time + duration > ?");

    // For 2026-02-27 in Asia/Shanghai (UTC+8):
    // Day start = 2026-02-27 00:00 CST = 2026-02-26 16:00 UTC = epoch 1772121600
    // Day end   = 2026-02-28 00:00 CST = 2026-02-27 16:00 UTC = epoch 1772208000
    const dayStartEpoch = sessionQuery!.params[1] as number;
    const dayEndEpoch = sessionQuery!.params[2] as number;
    expect(dayEndEpoch - dayStartEpoch).toBe(86400); // exactly 24 hours
    expect(dayStartEpoch).toBe(1772121600); // 2026-02-26T16:00:00Z
    expect(dayEndEpoch).toBe(1772208000); // 2026-02-27T16:00:00Z
  });

  test("computes stats fresh from D1 even when cached row has no AI result", async () => {
    // Cached row exists but has no AI result — route should compute stats
    // fresh from D1 and proceed to AI generation (not error out).
    const cachedRowNoAi = {
      ...cachedAiRow,
      ai_result_json: null,
      ai_score: null,
      ai_model: null,
      ai_generated_at: null,
    };

    const { calls } = mockD1([
      [tzRow],
      [cachedRowNoAi],
      ...claimWrites,
      aiSettingsRows,
      [sampleSession],
      [],
      [],
      [],
    ]);

    // Will fail at AI call, but should NOT return 400
    const res = await callPOST(makeAnalyzeRequest("2026-02-27"), "2026-02-27");
    expect(res.status).not.toBe(400);

    // Verify it queried focus_sessions (proving it computes stats fresh)
    const sessionQuery = calls.find((c) => c.sql.includes("focus_sessions"));
    expect(sessionQuery).toBeDefined();
  });

  test("returns 502 for parse_error from runAnalysis", async () => {
    const { __testOverrides } = await import("../setup");
    __testOverrides.generateText = async () => ({
      text: "not valid json at all",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    mockD1([[tzRow], [], ...claimWrites, aiSettingsRows, [sampleSession], [], [], []]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-27"), "2026-02-27");
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toContain("Failed to parse AI response");

    __testOverrides.generateText = null;
  });

  test("returns 504 for AI timeout error", async () => {
    const { __testOverrides } = await import("../setup");
    __testOverrides.generateText = async () => {
      throw new DOMException("The operation was aborted.", "TimeoutError");
    };

    mockD1([[tzRow], [], ...claimWrites, aiSettingsRows, [sampleSession], [], [], []]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-27"), "2026-02-27");
    expect(res.status).toBe(504);

    const data = await res.json();
    expect(data.error).toContain("timed out");

    __testOverrides.generateText = null;
  });

  test("returns success with email notification on manual analyze", async () => {
    const validResult = {
      score: 72,
      highlights: ["Good focus"],
      improvements: ["Take breaks"],
      timeSegments: [{ timeRange: "09:00-11:00", label: "Dev", description: "Coding" }],
      summary: "Good day.",
    };

    const { __testOverrides } = await import("../setup");
    __testOverrides.generateText = async () => ({
      text: JSON.stringify(validResult),
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    });

    mockD1([
      [tzRow],
      [],
      ...claimWrites,
      aiSettingsRows,
      [sampleSession],
      [],
      [],
      [],
      upsertOk,
      [
        {
          user_id: "e2e-test-user",
          key: "notification.email.onManualAnalyze",
          value: "true",
          updated_at: Date.now(),
        },
      ],
      [],
      [],
      [],
    ]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-27"), "2026-02-27");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.cached).toBe(false);
    expect(data.score).toBe(72);
    expect(data.result.summary).toBe("Good day.");
    expect(data.provider).toBe("anthropic");
    expect(data.usage).toBeDefined();
    expect(data.durationMs).toBeDefined();
    expect(data.prompt).toBeDefined();

    __testOverrides.generateText = null;
  });

  test("returns success without email when notification not enabled", async () => {
    const validResult = {
      score: 85,
      highlights: ["Productive day"],
      improvements: ["Drink water"],
      timeSegments: [],
      summary: "Great day.",
    };

    const { __testOverrides } = await import("../setup");
    __testOverrides.generateText = async () => ({
      text: JSON.stringify(validResult),
      usage: { promptTokens: 50, completionTokens: 100, totalTokens: 150 },
    });

    mockD1([
      [tzRow],
      [],
      ...claimWrites,
      aiSettingsRows,
      [sampleSession],
      [],
      [],
      [],
      upsertOk,
      [],
    ]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-27"), "2026-02-27");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.cached).toBe(false);
    expect(data.score).toBe(85);

    __testOverrides.generateText = null;
  });
});
