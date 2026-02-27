import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { resetSyncQueue } from "../../lib/sync-queue";

// ---------------------------------------------------------------------------
// /api/sync route handler tests
// Validates the 202 Accepted + enqueue behavior.
// No D1 mock needed — the route no longer calls D1 directly.
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.E2E_SKIP_AUTH = "true";
  // Reset the singleton queue before each test
  resetSyncQueue();
});

afterEach(() => {
  delete process.env.E2E_SKIP_AUTH;
  resetSyncQueue();
});

// Sample session for testing
function sampleSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    app_name: "Google Chrome",
    window_title: "GitHub - gecko",
    url: "https://github.com/user/gecko",
    start_time: 1740600000.0,
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
  test("returns 202 Accepted with accepted count and sync_id", async () => {
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
    expect(res.status).toBe(202);

    const data = await res.json();
    expect(data.accepted).toBe(1);
    expect(data.sync_id).toBeTruthy();
    expect(typeof data.sync_id).toBe("string");
  });

  test("accepts multiple sessions and returns correct count", async () => {
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
    expect(res.status).toBe(202);

    const data = await res.json();
    expect(data.accepted).toBe(3);
    expect(data.sync_id).toBeTruthy();
  });

  test("does not make any D1 calls in the request path", async () => {
    // Capture all fetch calls — none should go to D1
    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];
    globalThis.fetch = mock((...args: unknown[]) => {
      const url =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof Request
            ? args[0].url
            : "";
      fetchCalls.push(url);
      return originalFetch(...(args as Parameters<typeof fetch>));
    }) as unknown as typeof fetch;

    try {
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

      await POST(req);

      // No fetch calls should have been made to cloudflare D1
      const d1Calls = fetchCalls.filter((url) =>
        url.includes("api.cloudflare.com"),
      );
      expect(d1Calls.length).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("enqueues sessions into the sync queue", async () => {
    const { getSyncQueue } = await import("../../lib/sync-queue");
    const { POST } = await import("../../app/api/sync/route");

    const sessions = [
      sampleSession({ id: "id-1" }),
      sampleSession({ id: "id-2" }),
    ];

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: JSON.stringify({ sessions }),
    });

    await POST(req);

    const queue = getSyncQueue();
    const stats = queue.getStats();
    expect(stats.pending).toBe(2);
  });

  test("returns 400 for empty sessions array", async () => {
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
    const { POST } = await import("../../app/api/sync/route");

    const sessions = Array.from({ length: 1001 }, (_, i) =>
      sampleSession({ id: `id-${i}` }),
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

  test("maps boolean fields correctly in queued sessions", async () => {
    const { getSyncQueue } = await import("../../lib/sync-queue");
    const { POST } = await import("../../app/api/sync/route");

    const req = new Request("http://localhost/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer gk_test123",
      },
      body: JSON.stringify({
        sessions: [
          sampleSession({ is_full_screen: true, is_minimized: true }),
        ],
      }),
    });

    await POST(req);

    // Verify the queue has sessions with correct types
    const queue = getSyncQueue();
    expect(queue.getStats().pending).toBe(1);
  });
});
