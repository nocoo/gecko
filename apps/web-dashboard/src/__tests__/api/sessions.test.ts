import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// /api/sessions route handler tests
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

const sampleRow = {
  id: "session-1",
  app_name: "Google Chrome",
  window_title: "GitHub",
  url: "https://github.com",
  start_time: 1740600000,
  end_time: 1740600120,
  duration: 120,
  bundle_id: "com.google.Chrome",
  tab_title: "GitHub - gecko",
  tab_count: 5,
  document_path: null,
  is_full_screen: 1,
  is_minimized: 0,
  device_id: "dev-1",
  synced_at: "2026-02-27T00:00:00.000Z",
};

describe("GET /api/sessions", () => {
  test("returns paginated sessions with mapped fields", async () => {
    const { calls } = mockD1([[sampleRow]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = new Request("http://localhost/api/sessions");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].id).toBe("session-1");
    expect(data.sessions[0].appName).toBe("Google Chrome");
    expect(data.sessions[0].isFullScreen).toBe(true);
    expect(data.sessions[0].isMinimized).toBe(false);
    expect(data.limit).toBe(50);
    expect(data.offset).toBe(0);

    expect(calls.length).toBe(1);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("FROM focus_sessions");
    expect(c0.params).toEqual(["e2e-test-user", 50, 0]);
  });

  test("respects limit and offset query params", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = new Request("http://localhost/api/sessions?limit=10&offset=20");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.limit).toBe(10);
    expect(data.offset).toBe(20);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.params).toEqual(["e2e-test-user", 10, 20]);
  });

  test("caps limit at MAX_LIMIT (200)", async () => {
    const { calls } = mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const req = new Request("http://localhost/api/sessions?limit=9999");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.limit).toBe(200);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.params[1]).toBe(200);
  });

  test("returns empty array when no sessions", async () => {
    mockD1([[]]);
    const { GET } = await import("../../app/api/sessions/route");

    const res = await GET(new Request("http://localhost/api/sessions"));
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.sessions).toEqual([]);
  });
});
