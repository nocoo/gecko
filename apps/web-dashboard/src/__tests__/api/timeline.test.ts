import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// GET /api/stats/timeline — daily aggregated screen time
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

  globalThis.fetch = mock((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    const results = responses[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 }
      )
    );
  }) as unknown as typeof fetch;

  return { calls };
}

describe("GET /api/stats/timeline", () => {
  test("returns daily aggregated data", async () => {
    mockD1([
      [
        { date: "2026-02-25", total_duration: 7200, session_count: 15, app_count: 5 },
        { date: "2026-02-26", total_duration: 5400, session_count: 10, app_count: 4 },
        { date: "2026-02-27", total_duration: 3600, session_count: 8, app_count: 3 },
      ],
    ]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = new Request("http://localhost/api/stats/timeline?period=week");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.period).toBe("week");
    expect(data.timeline).toHaveLength(3);
    expect(data.timeline[0]).toEqual({
      date: "2026-02-25",
      totalDuration: 7200,
      sessionCount: 15,
      appCount: 5,
    });
  });

  test("defaults to 'week' period", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = new Request("http://localhost/api/stats/timeline");
    const res = await GET(req);
    const data = await res.json();

    expect(data.period).toBe("week");
    // Should have start_time filter
    expect(calls[0].params.length).toBe(2); // user_id + start_time
  });

  test("handles 'all' period without start_time filter", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = new Request("http://localhost/api/stats/timeline?period=all");
    const res = await GET(req);
    const data = await res.json();

    expect(data.period).toBe("all");
    // Only user_id, no start_time
    expect(calls[0].params.length).toBe(1);
  });

  test("handles 'month' period", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = new Request("http://localhost/api/stats/timeline?period=month");
    const res = await GET(req);
    const data = await res.json();

    expect(data.period).toBe("month");
    expect(calls[0].params.length).toBe(2);
  });

  test("returns empty timeline when no data", async () => {
    mockD1([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = new Request("http://localhost/api/stats/timeline?period=week");
    const res = await GET(req);
    const data = await res.json();

    expect(data.timeline).toEqual([]);
  });

  test("SQL groups by date and orders ASC", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = new Request("http://localhost/api/stats/timeline?period=week");
    await GET(req);

    const sql = calls[0].sql;
    expect(sql).toContain("GROUP BY date(start_time, 'unixepoch')");
    expect(sql).toContain("ORDER BY date ASC");
  });

  test("falls back to 'week' for invalid period", async () => {
    mockD1([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = new Request("http://localhost/api/stats/timeline?period=invalid");
    const res = await GET(req);
    const data = await res.json();

    expect(data.period).toBe("week");
  });
});
