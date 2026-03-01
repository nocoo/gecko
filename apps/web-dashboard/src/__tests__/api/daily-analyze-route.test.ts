/**
 * Route-level tests for POST /api/daily/[date]/analyze.
 *
 * Stats are always computed fresh from D1 (the daily_summaries table
 * only caches AI results). AI generation itself is not tested here
 * (requires mocking generateText); pure-function coverage is in
 * daily-analyze.test.ts.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.E2E_SKIP_AUTH = "true";
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  delete process.env.E2E_SKIP_AUTH;
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// D1 mock helper
// ---------------------------------------------------------------------------

function mockD1(responses: unknown[][] = [[]]) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = mock((_url: string, init: RequestInit) => {
    // AI SDK calls won't have a SQL body — detect and reject them
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body as string);
    } catch {
      // Non-JSON body (e.g. AI SDK call) — return error
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Invalid JSON response" }), { status: 400 }),
      );
    }

    if (!body.sql) {
      // AI SDK or other non-D1 call
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Invalid JSON response" }), { status: 400 }),
      );
    }

    calls.push({ sql: body.sql as string, params: body.params as unknown[] });

    const results = responses[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Timezone settings row mock for Asia/Shanghai. */
const tzRow = { user_id: "e2e-test-user", key: "timezone", value: "Asia/Shanghai", updated_at: Date.now() };

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
  { user_id: "e2e-test-user", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: Date.now() },
];

function makeAnalyzeRequest(date: string, force = false): Request {
  const url = force
    ? `http://localhost/api/daily/${date}/analyze?force=true`
    : `http://localhost/api/daily/${date}/analyze`;
  return new Request(url, { method: "POST" });
}

async function callPOST(req: Request, date: string): Promise<Response> {
  const { POST } = await import("../../app/api/daily/[date]/analyze/route");
  return POST(req, { params: Promise.resolve({ date }) });
}

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
    mockD1([
      // 1. getUserTimezone
      [tzRow],
      // 2. dailySummaryRepo.findByUserAndDate — no cached AI
      [],
      // 3. settingsRepo.findByUserId — AI settings
      aiSettingsRows,
      // 4. fetchSessionsForDate — empty
      [],
    ]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-20"), "2026-02-20");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("No sessions found");
  });

  test("returns 400 when AI settings not configured", async () => {
    mockD1([
      // 1. getUserTimezone
      [tzRow],
      // 2. dailySummaryRepo.findByUserAndDate — no cached AI
      [],
      // 3. settingsRepo.findByUserId — empty (no AI settings)
      [],
      // 4. fetchSessionsForDate — has sessions (won't reach here)
      // (won't be called because we check AI config before sessions)
    ]);

    const res = await callPOST(makeAnalyzeRequest("2026-02-20"), "2026-02-20");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("AI provider and API key must be configured");
  });

  test("force=true skips AI cache check", async () => {
    const { calls } = mockD1([
      // 1. getUserTimezone
      [tzRow],
      // No cache check — force=true skips it
      // 2. settingsRepo.findByUserId — AI settings
      aiSettingsRows,
      // 3. fetchSessionsForDate — has sessions but will fail at AI call
      [
        { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: 1772157600, duration: 3600 },
      ],
      // 4-6. loadAppContext — categories, tags, notes
      [],
      [],
      [],
      // generateText will fail but we're testing the skip behavior
    ]);

    const _res = await callPOST(makeAnalyzeRequest("2026-02-27", true), "2026-02-27");
    // Will get 502 because generateText isn't mocked, but that's fine —
    // we're verifying that it reached the AI call (skipped cache).
    // The key assertion: no SQL query for daily_summaries was made.
    const cacheQueries = calls.filter((c) => c.sql.includes("daily_summaries"));
    expect(cacheQueries).toHaveLength(0);
  });

  test("queries sessions with timezone-aware day boundaries", async () => {
    const { calls } = mockD1([
      // 1. getUserTimezone
      [tzRow],
      // 2. dailySummaryRepo.findByUserAndDate — no cached AI
      [],
      // 3. settingsRepo.findByUserId — AI settings
      aiSettingsRows,
      // 4. fetchSessionsForDate
      [
        { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: 1772157600, duration: 3600 },
      ],
      // 5-7. loadAppContext — categories, tags, notes
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
      // 1. getUserTimezone
      [tzRow],
      // 2. dailySummaryRepo.findByUserAndDate — cached row but no AI result
      [cachedRowNoAi],
      // 3. settingsRepo.findByUserId — AI settings
      aiSettingsRows,
      // 4. fetchSessionsForDate — has sessions
      [
        { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: 1772157600, duration: 3600 },
      ],
      // 5-7. loadAppContext — categories, tags, notes
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
});
