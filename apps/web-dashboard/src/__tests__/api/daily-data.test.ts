import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// /api/daily/[date] route handler tests
// ---------------------------------------------------------------------------

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

function mockD1(responses: unknown[][] = [[]]) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    const results = responses[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: results.length, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

const tzRow = {
  user_id: "e2e-test-user",
  key: "timezone",
  value: "Asia/Shanghai",
  updated_at: 1000,
};

const sampleSessionRow = {
  id: "s1",
  app_name: "VSCode",
  bundle_id: "com.microsoft.VSCode",
  window_title: "test.ts",
  url: null,
  start_time: 1772157600,
  duration: 3600,
};

const cachedAiRow = {
  id: "sum-1",
  user_id: "e2e-test-user",
  date: "2026-02-27",
  ai_score: 80,
  ai_result_json: JSON.stringify({
    score: 80,
    highlights: ["focused"],
    improvements: [],
    timeSegments: [],
    summary: "Good day.",
  }),
  ai_model: "test-model",
  ai_generated_at: "2026-02-28T00:00:00Z",
  ai_prompt: "test-prompt",
  created_at: "2026-02-28T00:00:00Z",
  updated_at: "2026-02-28T00:00:00Z",
};

async function callGET(date: string) {
  const { GET } = await import("../../app/api/daily/[date]/route");
  const req = new Request(`http://localhost/api/daily/${date}`);
  return GET(req, { params: Promise.resolve({ date }) });
}

describe("GET /api/daily/[date]", () => {
  test("returns stats and cached AI result when available", async () => {
    mockD1([
      [tzRow], // getUserTimezone
      [sampleSessionRow], // fetchSessionsForDate
      [cachedAiRow], // dailySummaryRepo.findByUserAndDate
    ]);

    const res = await callGET("2026-02-27");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.timezone).toBe("Asia/Shanghai");
    expect(data.stats).toBeTruthy();
    expect(data.ai).toBeTruthy();
    expect(data.ai.score).toBe(80);
    expect(data.ai.result.highlights).toEqual(["focused"]);
    expect(data.ai.model).toBe("test-model");
    expect(data.ai.prompt).toBe("test-prompt");
  });

  test("returns null AI when no cached analysis", async () => {
    mockD1([
      [tzRow],
      [sampleSessionRow],
      [], // no cached AI
    ]);

    const res = await callGET("2026-02-27");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ai).toBeNull();
    expect(data.stats).toBeTruthy();
  });

  test("returns 400 for invalid date format", async () => {
    mockD1([[tzRow]]);

    const res = await callGET("not-a-date");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Invalid date format");
  });

  test("returns 400 for impossible date", async () => {
    mockD1([[tzRow]]);

    const res = await callGET("2026-13-99");
    expect(res.status).toBe(400);
  });

  test("returns 400 for future dates", async () => {
    mockD1([[tzRow]]);

    const res = await callGET("2099-12-31");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("future");
  });
});
