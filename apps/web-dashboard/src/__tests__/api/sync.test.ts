import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/sync route handler tests
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

// Mock D1 — captures all SQL calls
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
          result: [
            {
              results,
              success: true,
              meta: { changes: results.length || 1, last_row_id: 0 },
            },
          ],
          errors: [],
        }),
        { status: 200 }
      )
    );
  }) as unknown as typeof fetch;

  return { calls };
}

// Sample session for testing
function sampleSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    app_name: "Google Chrome",
    window_title: "GitHub - gecko",
    url: "https://github.com/user/gecko",
    start_time: 1740600000.0,
    end_time: 1740600120.0,
    duration: 120.0,
    bundle_id: "com.google.Chrome",
    tab_title: "gecko: Screen time tracker",
    tab_count: 12,
    document_path: null,
    is_full_screen: false,
    is_minimized: false,
    ...overrides,
  };
}

describe("POST /api/sync", () => {
  test("uploads sessions and returns count", async () => {
    // Two D1 calls: INSERT OR IGNORE for sessions, INSERT for sync_log
    const { calls } = mockD1([[], []]);
    const { POST } = await import("../../app/api/sync/route");

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: JSON.stringify({
        sessions: [sampleSession()],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.inserted).toBeGreaterThanOrEqual(0);
    expect(data.duplicates).toBeGreaterThanOrEqual(0);
    expect(data.sync_id).toBeTruthy();
  });

  test("handles multiple sessions", async () => {
    const { calls } = mockD1([[], []]);
    const { POST } = await import("../../app/api/sync/route");

    const sessions = [
      sampleSession({ id: "id-1", start_time: 1740600000.0 }),
      sampleSession({ id: "id-2", start_time: 1740600120.0 }),
      sampleSession({ id: "id-3", start_time: 1740600240.0 }),
    ];

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: JSON.stringify({ sessions }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(typeof data.inserted).toBe("number");
    expect(typeof data.duplicates).toBe("number");

    // Should have INSERT OR IGNORE calls for sessions + INSERT for sync log
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  test("returns 400 for empty sessions array", async () => {
    mockD1();
    const { POST } = await import("../../app/api/sync/route");

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: JSON.stringify({ sessions: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("sessions");
  });

  test("returns 400 for missing sessions field", async () => {
    mockD1();
    const { POST } = await import("../../app/api/sync/route");

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("returns 413 for batch larger than 1000", async () => {
    mockD1();
    const { POST } = await import("../../app/api/sync/route");

    const sessions = Array.from({ length: 1001 }, (_, i) =>
      sampleSession({ id: `id-${i}` })
    );

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: JSON.stringify({ sessions }),
    });

    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  test("returns 400 for invalid JSON", async () => {
    mockD1();
    const { POST } = await import("../../app/api/sync/route");

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: "not json",
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  test("validates required fields in sessions", async () => {
    mockD1();
    const { POST } = await import("../../app/api/sync/route");

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: JSON.stringify({
        sessions: [{ id: "123" }], // missing required fields
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("required");
  });
});
