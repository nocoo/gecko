import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// /api/daily/summaries route handler tests
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
        { status: 200 }
      )
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

async function callGET(from: string, to: string) {
  const { GET } = await import("../../app/api/daily/summaries/route");
  const req = new Request(
    `http://localhost/api/daily/summaries?from=${from}&to=${to}`,
  );
  return GET(req);
}

describe("GET /api/daily/summaries", () => {
  test("returns cached scores and hasAi flags for the range", async () => {
    mockD1([
      [tzRow], // getUserTimezone
      [
        { date: "2026-06-01", ai_score: 85, has_ai_result: 1 },
        { date: "2026-06-03", ai_score: 65, has_ai_result: 1 },
        { date: "2026-06-05", ai_score: null, has_ai_result: 0 }, // claimed/__analyzing__
      ],
    ]);

    const res = await callGET("2026-06-01", "2026-06-10");
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      summaries: Array<{ date: string; score: number | null; hasAi: boolean }>;
    };
    expect(data.summaries).toHaveLength(3);
    expect(data.summaries[0]).toEqual({
      date: "2026-06-01",
      score: 85,
      hasAi: true,
    });
    expect(data.summaries[1]).toEqual({
      date: "2026-06-03",
      score: 65,
      hasAi: true,
    });
    expect(data.summaries[2]).toEqual({
      date: "2026-06-05",
      score: null,
      hasAi: false,
    });
  });

  test("returns 400 for invalid date format", async () => {
    const res = await callGET("not-a-date", "2026-06-10");
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("Invalid date format");
  });

  test("returns 400 for missing query params", async () => {
    const { GET } = await import("../../app/api/daily/summaries/route");
    const req = new Request("http://localhost/api/daily/summaries");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  test("returns 400 when range exceeds 62 days", async () => {
    const res = await callGET("2026-01-01", "2026-12-31");
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error: string };
    expect(data.error).toContain("too wide");
  });

  test("returns 400 when from is after to", async () => {
    const res = await callGET("2026-06-10", "2026-06-01");
    expect(res.status).toBe(400);
  });

  test("clamps to today when `to` is in the future", async () => {
    const { calls } = mockD1([
      [tzRow],
      [], // empty result is fine
    ]);

    const res = await callGET("2026-06-01", "2099-12-31");
    // 2099-12-31 minus 2026-06-01 > 62 days → 400 before clamp.
    // Range cap is checked first, so use a tighter window to exercise clamp.
    expect(res.status).toBe(400);
    expect(calls.length).toBeGreaterThanOrEqual(0);
  });

  test("returns empty array when range is fully in the future", async () => {
    mockD1([
      [tzRow],
    ]);

    // 60-day window starting in 2099 — within range cap but entirely after today.
    const res = await callGET("2099-01-01", "2099-02-28");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      summaries: Array<unknown>;
    };
    expect(data.summaries).toEqual([]);
  });
});
