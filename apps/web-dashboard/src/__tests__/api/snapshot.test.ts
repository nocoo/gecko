import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// GET /api/v1/snapshot — Public API snapshot endpoint tests
// Uses E2E_SKIP_AUTH=true to bypass API key auth.
// Mocks D1 client to avoid real Cloudflare calls.
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
          result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

describe("GET /api/v1/snapshot", () => {
  test("returns snapshot for a valid date with sessions", async () => {
    const dayStart = 1740585600; // 2025-02-27 00:00:00 Asia/Shanghai
    mockD1([
      // 1. getUserTimezone → settings lookup
      [{ user_id: "e2e-test-user", key: "timezone", value: "Asia/Shanghai", updated_at: Date.now() }],
      // 2. fetchSessionsForDate → focus_sessions
      [
        {
          id: "s1",
          app_name: "VS Code",
          bundle_id: "com.microsoft.VSCode",
          window_title: "main.ts",
          url: null,
          start_time: dayStart + 3600,
          duration: 1800,
        },
        {
          id: "s2",
          app_name: "Chrome",
          bundle_id: "com.google.Chrome",
          window_title: "GitHub",
          url: "https://github.com",
          start_time: dayStart + 7200,
          duration: 900,
        },
      ],
      // 3. dailySummaryRepo.findByUserAndDate
      [],
    ]);

    const { GET } = await import("../../app/api/v1/snapshot/route");

    const req = new Request("http://localhost/api/v1/snapshot?date=2025-02-27", {
      headers: { Authorization: "Bearer gk_test" },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.date).toBe("2025-02-27");
    expect(data.timezone).toBe("Asia/Shanghai");
    expect(data.stats).toBeDefined();
    expect(data.stats.totalSessions).toBe(2);
    expect(data.stats.topApps).toHaveLength(2);
    expect(data.stats.sessions).toHaveLength(2);
    expect(data.stats.scores).toBeDefined();
    expect(data.ai).toBeNull();
  });

  test("returns snapshot with cached AI analysis", async () => {
    mockD1([
      // timezone
      [{ user_id: "e2e-test-user", key: "timezone", value: "Asia/Shanghai", updated_at: Date.now() }],
      // sessions
      [],
      // cached AI
      [{
        id: "ds1",
        user_id: "e2e-test-user",
        date: "2025-02-27",
        ai_score: 78,
        ai_result_json: JSON.stringify({ summary: "Good focus day" }),
        ai_model: "gpt-4o",
        ai_generated_at: "2025-02-27T20:00:00.000Z",
      }],
    ]);

    const { GET } = await import("../../app/api/v1/snapshot/route");

    const req = new Request("http://localhost/api/v1/snapshot?date=2025-02-27");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ai).not.toBeNull();
    expect(data.ai.score).toBe(78);
    expect(data.ai.result.summary).toBe("Good focus day");
    expect(data.ai.model).toBe("gpt-4o");
  });

  test("returns empty stats when no sessions exist", async () => {
    mockD1([
      // timezone
      [{ user_id: "e2e-test-user", key: "timezone", value: "Asia/Shanghai", updated_at: Date.now() }],
      // no sessions
      [],
      // no AI
      [],
    ]);

    const { GET } = await import("../../app/api/v1/snapshot/route");

    const req = new Request("http://localhost/api/v1/snapshot?date=2025-02-27");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.stats.totalSessions).toBe(0);
    expect(data.stats.totalDuration).toBe(0);
    expect(data.stats.topApps).toEqual([]);
    expect(data.stats.sessions).toEqual([]);
  });

  test("returns 400 when date parameter is missing", async () => {
    mockD1();
    const { GET } = await import("../../app/api/v1/snapshot/route");

    const req = new Request("http://localhost/api/v1/snapshot");
    const res = await GET(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("date");
  });

  test("returns 400 for invalid date format", async () => {
    mockD1([
      // timezone lookup
      [{ user_id: "e2e-test-user", key: "timezone", value: "Asia/Shanghai", updated_at: Date.now() }],
    ]);
    const { GET } = await import("../../app/api/v1/snapshot/route");

    const req = new Request("http://localhost/api/v1/snapshot?date=27-02-2025");
    const res = await GET(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("date format");
  });

  test("returns 400 for invalid date values (e.g. Feb 30)", async () => {
    mockD1([
      [{ user_id: "e2e-test-user", key: "timezone", value: "Asia/Shanghai", updated_at: Date.now() }],
    ]);
    const { GET } = await import("../../app/api/v1/snapshot/route");

    const req = new Request("http://localhost/api/v1/snapshot?date=2025-02-30");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  test("returns 400 for future dates", async () => {
    mockD1([
      [{ user_id: "e2e-test-user", key: "timezone", value: "Asia/Shanghai", updated_at: Date.now() }],
    ]);
    const { GET } = await import("../../app/api/v1/snapshot/route");

    const req = new Request("http://localhost/api/v1/snapshot?date=2099-12-31");
    const res = await GET(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("future");
  });

  test("uses default timezone when user has no timezone setting", async () => {
    mockD1([
      // timezone lookup returns empty
      [],
      // sessions
      [],
      // AI
      [],
    ]);

    const { GET } = await import("../../app/api/v1/snapshot/route");

    const req = new Request("http://localhost/api/v1/snapshot?date=2025-02-27");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    // Default timezone is Asia/Shanghai
    expect(data.timezone).toBe("Asia/Shanghai");
  });
});
