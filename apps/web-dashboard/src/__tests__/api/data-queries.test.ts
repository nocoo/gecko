import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Data query endpoints tests
// /api/sessions, /api/stats, /api/sync/status
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

// ---------------------------------------------------------------------------
// GET /api/sessions
// ---------------------------------------------------------------------------

describe("GET /api/sessions", () => {
  test("returns paginated sessions", async () => {
    mockD1([
      [
        {
          id: "s1",
          app_name: "Chrome",
          window_title: "GitHub",
          url: "https://github.com",
          start_time: 1740600000.0,
          end_time: 1740600120.0,
          duration: 120.0,
          bundle_id: "com.google.Chrome",
          tab_title: "GitHub",
          tab_count: 5,
          document_path: null,
          is_full_screen: 0,
          is_minimized: 0,
          device_id: "dev-1",
          synced_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    ]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = new Request("http://localhost/api/sessions?limit=50&offset=0");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].appName).toBe("Chrome");
  });

  test("defaults to limit=50, offset=0", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = new Request("http://localhost/api/sessions");
    await GET(req);

    expect(calls[0].sql).toContain("LIMIT");
    expect(calls[0].params).toContain(50);
    expect(calls[0].params).toContain(0);
  });

  test("respects custom limit and offset", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = new Request("http://localhost/api/sessions?limit=10&offset=20");
    await GET(req);

    expect(calls[0].params).toContain(10);
    expect(calls[0].params).toContain(20);
  });

  test("caps limit at 200", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = new Request("http://localhost/api/sessions?limit=999");
    await GET(req);

    expect(calls[0].params).toContain(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/stats
// ---------------------------------------------------------------------------

describe("GET /api/stats", () => {
  test("returns aggregated stats", async () => {
    mockD1([
      // Total stats query
      [{ total_sessions: 100, total_duration: 50000.0, total_apps: 15 }],
      // Top apps query
      [
        { app_name: "Chrome", total_duration: 20000.0, session_count: 40 },
        { app_name: "VS Code", total_duration: 15000.0, session_count: 30 },
      ],
    ]);
    const { GET } = await import("../../app/api/stats/route");

    const req = new Request("http://localhost/api/stats");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.totalSessions).toBe(100);
    expect(data.totalDuration).toBe(50000.0);
    expect(data.topApps).toHaveLength(2);
    expect(data.topApps[0].appName).toBe("Chrome");
  });

  test("handles no data gracefully", async () => {
    mockD1([
      [{ total_sessions: 0, total_duration: 0, total_apps: 0 }],
      [],
    ]);
    const { GET } = await import("../../app/api/stats/route");

    const req = new Request("http://localhost/api/stats");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.totalSessions).toBe(0);
    expect(data.topApps).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /api/sync/status
// ---------------------------------------------------------------------------

describe("GET /api/sync/status", () => {
  test("returns sync health info", async () => {
    mockD1([
      // Recent sync logs
      [
        {
          device_id: "dev-1",
          session_count: 50,
          synced_at: "2026-01-02T12:00:00.000Z",
        },
      ],
      // API keys (to get device names)
      [{ device_id: "dev-1", name: "MacBook Pro" }],
    ]);
    const { GET } = await import("../../app/api/sync/status/route");

    const req = new Request("http://localhost/api/sync/status");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0].deviceId).toBe("dev-1");
    expect(data.devices[0].name).toBe("MacBook Pro");
    expect(data.devices[0].lastSync).toBe("2026-01-02T12:00:00.000Z");
  });

  test("handles no sync history", async () => {
    mockD1([[], []]);
    const { GET } = await import("../../app/api/sync/status/route");

    const req = new Request("http://localhost/api/sync/status");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.devices).toEqual([]);
  });
});
