import { describe, test, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// /api/live route handler tests (surety standard)
// ---------------------------------------------------------------------------

// Mock the D1 module so tests don't need real DB credentials.
const mockQuery = mock(() => Promise.resolve([{ probe: 1 }]));
const mockGetD1Config = mock(() => ({
  accountId: "test-account",
  apiToken: "test-token",
  databaseId: "test-db",
}));

mock.module("@/lib/d1", () => ({
  query: mockQuery,
  getD1Config: mockGetD1Config,
}));

// Fresh import per test to avoid module cache issues.
async function callGET() {
  const { GET } = await import("../../app/api/live/route");
  return GET();
}

describe("/api/live (surety standard)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockImplementation(() => Promise.resolve([{ probe: 1 }]));
    mockGetD1Config.mockReset();
    mockGetD1Config.mockImplementation(() => ({
      accountId: "test-account",
      apiToken: "test-token",
      databaseId: "test-db",
    }));
  });

  // --- Happy path ---

  test("returns 200 with all surety fields when healthy", async () => {
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
    const res = await callGET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  test("response has exactly the expected keys on success", async () => {
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
    mockQuery.mockImplementation(() => {
      throw new Error("connection refused");
    });

    const res = await callGET();
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.status).toBe("error");
    expect(data.database.connected).toBe(false);
    expect(typeof data.database.error).toBe("string");
  });

  test("returns 503 when DB is not configured", async () => {
    mockGetD1Config.mockImplementation(() => ({
      accountId: "",
      apiToken: "",
      databaseId: "",
    }));

    const res = await callGET();
    expect(res.status).toBe(503);

    const data = await res.json();
    expect(data.database.connected).toBe(false);
    expect(data.database.error).toContain("not configured");
  });

  // --- Error sanitisation ---

  test("sanitises 'ok' from DB error messages", async () => {
    mockQuery.mockImplementation(() => {
      throw new Error("something ok happened");
    });

    const res = await callGET();
    const data = await res.json();

    expect(data.database.error).not.toMatch(/\bok\b/i);
    expect(data.database.error).toContain("***");
  });

  // --- Catastrophic error branch ---

  test("catastrophic error returns 503 with reason", async () => {
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
