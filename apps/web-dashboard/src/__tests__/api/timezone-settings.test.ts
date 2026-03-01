import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/settings/timezone route handler tests
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
          result: [
            {
              results,
              success: true,
              meta: { changes: results.length > 0 ? 1 : 0, last_row_id: 0 },
            },
          ],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

describe("/api/settings/timezone", () => {
  // -------------------------------------------------------------------------
  // GET
  // -------------------------------------------------------------------------
  describe("GET", () => {
    test("returns saved timezone for user", async () => {
      mockD1([
        [{ user_id: "e2e-test-user", key: "timezone", value: "America/New_York", updated_at: 1000 }],
      ]);
      const { GET } = await import("../../app/api/settings/timezone/route");

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timezone).toBe("America/New_York");
    });

    test("returns default timezone when no setting exists", async () => {
      mockD1([
        [], // no rows = no timezone setting
      ]);
      const { GET } = await import("../../app/api/settings/timezone/route");

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timezone).toBe("Asia/Shanghai");
    });

    test("returns default when stored value is invalid", async () => {
      mockD1([
        [{ user_id: "e2e-test-user", key: "timezone", value: "Invalid/Zone", updated_at: 1000 }],
      ]);
      const { GET } = await import("../../app/api/settings/timezone/route");

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timezone).toBe("Asia/Shanghai");
    });
  });

  // -------------------------------------------------------------------------
  // PUT
  // -------------------------------------------------------------------------
  describe("PUT", () => {
    test("saves a valid timezone", async () => {
      const { calls } = mockD1([
        [], // upsert returns no rows
      ]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = new Request("http://localhost/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "Europe/London" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.timezone).toBe("Europe/London");

      // Verify the upsert SQL was called
      expect(calls.length).toBe(1);
      expect(calls[0].sql).toContain("INSERT INTO settings");
      expect(calls[0].params[0]).toBe("e2e-test-user");
      expect(calls[0].params[1]).toBe("timezone");
      expect(calls[0].params[2]).toBe("Europe/London");
    });

    test("rejects invalid timezone string", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = new Request("http://localhost/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "Not_A_Zone" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("Invalid IANA timezone");
    });

    test("rejects missing timezone field", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = new Request("http://localhost/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("Missing timezone");
    });

    test("rejects non-string timezone field", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = new Request("http://localhost/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: 123 }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("rejects invalid JSON body", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/timezone/route");

      const req = new Request("http://localhost/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("Invalid JSON");
    });
  });
});
