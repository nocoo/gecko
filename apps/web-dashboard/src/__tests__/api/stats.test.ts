import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// /api/stats route handler tests
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

describe("GET /api/stats", () => {
  test("returns aggregated stats for default period (today)", async () => {
    mockD1([
      [tzRow], // getUserTimezone
      [{ total_sessions: 10, total_duration: 3600, total_apps: 3 }], // totals
      [{ max_duration: 900 }], // longest
      [
        {
          app_name: "Chrome",
          bundle_id: "com.google.Chrome",
          total_duration: 2000,
          session_count: 5,
        },
        { app_name: "Xcode", bundle_id: "com.apple.Xcode", total_duration: 1600, session_count: 5 },
      ], // topApps
    ]);
    const { GET } = await import("../../app/api/stats/route");

    const req = new Request("http://localhost/api/stats");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.period).toBe("today");
    expect(data.totalSessions).toBe(10);
    expect(data.totalDuration).toBe(3600);
    expect(data.totalApps).toBe(3);
    expect(data.longestSession).toBe(900);
    expect(data.topApps).toHaveLength(2);
    expect(data.topApps[0].appName).toBe("Chrome");
    expect(data.topApps[0].bundleId).toBe("com.google.Chrome");
  });

  test("falls back to today for invalid period", async () => {
    mockD1([
      [tzRow],
      [{ total_sessions: 0, total_duration: 0, total_apps: 0 }],
      [{ max_duration: 0 }],
      [],
    ]);
    const { GET } = await import("../../app/api/stats/route");

    const req = new Request("http://localhost/api/stats?period=bogus");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.period).toBe("today");
  });

  test("accepts period=all and omits start_time filter", async () => {
    const { calls } = mockD1([
      [tzRow],
      [{ total_sessions: 100, total_duration: 36000, total_apps: 12 }],
      [{ max_duration: 1800 }],
      [],
    ]);
    const { GET } = await import("../../app/api/stats/route");

    const req = new Request("http://localhost/api/stats?period=all");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.period).toBe("all");

    // The totals query (call index 1) should only have user_id (1 param).
    const totalsCall = calls[1];
    if (!totalsCall) return;
    expect(totalsCall.params).toEqual(["e2e-test-user"]);
  });

  test("period=week filters with start_time", async () => {
    const { calls } = mockD1([
      [tzRow],
      [{ total_sessions: 50, total_duration: 18000, total_apps: 8 }],
      [{ max_duration: 1200 }],
      [],
    ]);
    const { GET } = await import("../../app/api/stats/route");

    const req = new Request("http://localhost/api/stats?period=week");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.period).toBe("week");

    const totalsCall = calls[1];
    if (!totalsCall) return;
    // user_id + start_time
    expect(totalsCall.params).toHaveLength(2);
    expect(totalsCall.params[0]).toBe("e2e-test-user");
    expect(typeof totalsCall.params[1]).toBe("number");
  });

  test("returns zero defaults when no sessions", async () => {
    mockD1([
      [tzRow],
      [], // no totals row
      [], // no longest row
      [],
    ]);
    const { GET } = await import("../../app/api/stats/route");

    const req = new Request("http://localhost/api/stats");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.totalSessions).toBe(0);
    expect(data.totalDuration).toBe(0);
    expect(data.totalApps).toBe(0);
    expect(data.longestSession).toBe(0);
    expect(data.topApps).toEqual([]);
  });
});
