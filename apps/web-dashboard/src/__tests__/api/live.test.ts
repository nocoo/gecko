import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// /api/live route handler tests (surety standard)
// Mock globalThis.fetch (same pattern as data-queries.test.ts) to avoid
// mock.module leak across test files.
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account";
  process.env.CF_API_TOKEN = "test-token";
  process.env.CF_D1_DATABASE_ID = "test-db";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.CF_ACCOUNT_ID;
  delete process.env.CF_API_TOKEN;
  delete process.env.CF_D1_DATABASE_ID;
});

/** Mock fetch to return a successful D1 probe response. */
function mockD1Probe(success = true, error?: string) {
  globalThis.fetch = mock(() => {
    if (!success && error) {
      return Promise.reject(new Error(error));
    }
    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              results: [{ probe: 1 }],
              success: true,
              meta: { changes: 0, last_row_id: 0 },
            },
          ],
          errors: [],
        }),
        { status: 200 }
      )
    );
  }) as unknown as typeof fetch;
}

async function callGET() {
  const { GET } = await import("../../app/api/live/route");
  return GET();
}

describe("/api/live (surety standard)", () => {
  // --- Happy path ---

  test("returns 200 with all surety fields when healthy", async () => {
    mockD1Probe();
    const res = await callGET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(typeof data.version).toBe("string");
    expect(data.version.length).toBeGreaterThan(0);
    expect(data.component).toBe("gecko-dashboard");
    expect(typeof data.uptime).toBe("number");
    expect(data.uptime).toBeGreaterThanOrEqual(0);
    expect(data.database).toEqual({ connected: true });

    // Validate ISO 8601 timestamp
    const parsed = new Date(data.timestamp).getTime();
    expect(Number.isNaN(parsed)).toBe(false);
  });

  test("sets Cache-Control: no-store", async () => {
    mockD1Probe();
    const res = await callGET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("response has exactly the expected keys on success", async () => {
    mockD1Probe();
    const res = await callGET();
    const data = await res.json();
    const keys = Object.keys(data).sort();
    expect(keys).toEqual([
      "component",
      "database",
      "status",
      "timestamp",
      "uptime",
      "version",
    ]);
  });

  // --- Database unhealthy ---

  test("returns 503 when DB probe fails", async () => {
    // Mock fetch to throw (simulates network / DB error)
    globalThis.fetch = mock(() => {
      throw new Error("connection refused");
    }) as unknown as typeof fetch;

    const res = await callGET();
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.status).toBe("error");
    expect(data.database.connected).toBe(false);
    expect(typeof data.database.error).toBe("string");
  });

  test("returns 503 when DB is not configured", async () => {
    // Clear env vars to simulate unconfigured DB
    delete process.env.CF_ACCOUNT_ID;
    delete process.env.CF_API_TOKEN;
    delete process.env.CF_D1_DATABASE_ID;

    const res = await callGET();
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.database.connected).toBe(false);
    expect(data.database.error).toContain("not configured");
  });

  // --- Error sanitisation ---

  test("sanitises 'ok' from DB error messages", async () => {
    globalThis.fetch = mock(() => {
      throw new Error("something ok happened");
    }) as unknown as typeof fetch;

    const res = await callGET();
    const data = await res.json();

    expect(data.database.error).not.toMatch(/\bok\b/i);
    expect(data.database.error).toContain("***");
  });

  // --- Catastrophic error branch ---

  test("catastrophic error returns 503 with reason", async () => {
    mockD1Probe();
    const origJson = Response.json;
    let callCount = 0;
    Response.json = (...args: Parameters<typeof Response.json>) => {
      callCount++;
      if (callCount === 1) throw new Error("total failure");
      return origJson.apply(Response, args);
    };

    try {
      const res = await callGET();
      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.status).toBe("error");
      expect(data.reason).toBe("total failure");
      expect(data.component).toBe("gecko-dashboard");

      // No "ok" in error response
      const raw = JSON.stringify(data).toLowerCase();
      expect(raw).not.toContain('"ok"');
    } finally {
      Response.json = origJson;
    }
  });
});
