import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { query, execute, getD1Config, verifyTestDatabase } from "../../lib/d1";

// ---------------------------------------------------------------------------
// D1 client tests — unit tests with mocked fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
  // Remove test override so getD1Config() uses CF_D1_DATABASE_ID
  delete process.env.CF_D1_DATABASE_ID_TEST;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.CF_D1_DATABASE_ID_TEST;
});

// Helper: mock fetch to return a D1 response
function mockFetch(result: unknown[], success = true, status = 200) {
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          success,
          result: [{ results: result, success, meta: { changes: 0, last_row_id: 0 } }],
          errors: success ? [] : [{ message: "D1 error" }],
        }),
        { status }
      )
    )
  ) as unknown as typeof fetch;
}

describe("d1 client", () => {
  // ---------------------------------------------------------------------------
  // query()
  // ---------------------------------------------------------------------------

  describe("query()", () => {
    test("sends correct HTTP request to D1 REST API", async () => {
      mockFetch([{ id: "1", name: "test" }]);

      await query("SELECT * FROM users WHERE id = ?", ["u1"]);

      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const call0 = fetchMock.mock.calls[0];
      if (!call0) return;
      const [url, options] = call0 as [string, RequestInit];
      expect(url).toBe(
        "https://api.cloudflare.com/client/v4/accounts/test-account-id/d1/database/test-db-id/query"
      );
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual({
        Authorization: "Bearer test-api-token",
        "Content-Type": "application/json",
      });

      const body = JSON.parse(options.body as string);
      expect(body.sql).toBe("SELECT * FROM users WHERE id = ?");
      expect(body.params).toEqual(["u1"]);
    });

    test("returns results array from D1 response", async () => {
      const rows = [
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ];
      mockFetch(rows);

      const result = await query("SELECT * FROM users");
      expect(result).toEqual(rows);
    });

    test("handles empty params", async () => {
      mockFetch([]);

      await query("SELECT 1");

      const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
      const call0 = fetchMock.mock.calls[0];
      if (!call0) return;
      const body = JSON.parse(
        (call0 as [string, RequestInit])[1].body as string
      );
      expect(body.params).toEqual([]);
    });

    test("throws on D1 API error response", async () => {
      mockFetch([], false, 200);

      expect(query("BAD SQL")).rejects.toThrow("D1 query failed");
    });

    test("uses 'Unknown D1 error' fallback when errors array is missing", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              result: [],
            }),
            { status: 200 }
          )
        )
      ) as unknown as typeof fetch;

      await expect(query("BAD SQL")).rejects.toThrow(
        "D1 query failed: Unknown D1 error"
      );
    });

    test("throws on HTTP error (non-200)", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve(new Response("Internal Server Error", { status: 500 }))
      ) as unknown as typeof fetch;

      expect(query("SELECT 1")).rejects.toThrow("D1 API error (500)");
    });

    test("throws on network error", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.reject(new Error("Network error"))
      ) as unknown as typeof fetch;

      expect(query("SELECT 1")).rejects.toThrow("Network error");
    });
  });

  // ---------------------------------------------------------------------------
  // execute()
  // ---------------------------------------------------------------------------

  describe("execute()", () => {
    test("returns meta with changes count", async () => {
      globalThis.fetch = vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              result: [
                {
                  results: [],
                  success: true,
                  meta: { changes: 5, last_row_id: 10 },
                },
              ],
              errors: [],
            }),
            { status: 200 }
          )
        )
      ) as unknown as typeof fetch;

      const result = await execute("INSERT INTO users VALUES (?, ?)", [
        "1",
        "Alice",
      ]);
      expect(result.meta.changes).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // Type safety
  // ---------------------------------------------------------------------------

  describe("type safety", () => {
    test("query returns typed results", async () => {
      interface User {
        id: string;
        name: string;
      }
      mockFetch([{ id: "1", name: "Alice" }]);

      const users = await query<User>("SELECT * FROM users");
      const u0 = users[0];
      if (!u0) return;
      expect(u0.id).toBe("1");
      expect(u0.name).toBe("Alice");
    });
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  describe("getD1Config()", () => {
    test("reads from env", () => {
      const config = getD1Config();
      expect(config.accountId).toBe("test-account-id");
      expect(config.apiToken).toBe("test-api-token");
      expect(config.databaseId).toBe("test-db-id");
    });

    test("returns empty strings when env vars missing", () => {
      delete process.env.CF_ACCOUNT_ID;
      delete process.env.CF_API_TOKEN;
      delete process.env.CF_D1_DATABASE_ID;

      const config = getD1Config();
      expect(config.accountId).toBe("");
      expect(config.apiToken).toBe("");
      expect(config.databaseId).toBe("");
    });

    test("CF_D1_DATABASE_ID_TEST takes priority over CF_D1_DATABASE_ID", () => {
      process.env.CF_D1_DATABASE_ID_TEST = "test-override-db-id";

      const config = getD1Config();
      expect(config.databaseId).toBe("test-override-db-id");

      delete process.env.CF_D1_DATABASE_ID_TEST;
    });

    test("falls back to CF_D1_DATABASE_ID when TEST var is absent", () => {
      delete process.env.CF_D1_DATABASE_ID_TEST;

      const config = getD1Config();
      expect(config.databaseId).toBe("test-db-id");
    });
  });

  // ---------------------------------------------------------------------------
  // verifyTestDatabase()
  // ---------------------------------------------------------------------------

  describe("verifyTestDatabase()", () => {
    test("passes when _test_marker has env=test", async () => {
      mockFetch([{ key: "env", value: "test" }]);

      await expect(verifyTestDatabase()).resolves.toBeUndefined();
    });

    test("throws when _test_marker has wrong value", async () => {
      mockFetch([{ key: "env", value: "production" }]);

      await expect(verifyTestDatabase()).rejects.toThrow(
        "is NOT a test instance"
      );
    });

    test("throws when _test_marker returns empty rows", async () => {
      mockFetch([]);

      await expect(verifyTestDatabase()).rejects.toThrow(
        "is NOT a test instance"
      );
    });

    test("throws when _test_marker table does not exist", async () => {
      // Simulate a D1 error for missing table
      globalThis.fetch = vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              success: false,
              result: [{ results: [], success: false, meta: { changes: 0, last_row_id: 0 } }],
              errors: [{ message: "no such table: _test_marker" }],
            }),
            { status: 200 }
          )
        )
      ) as unknown as typeof fetch;

      await expect(verifyTestDatabase()).rejects.toThrow(
        "not configured for E2E testing"
      );
    });
  });
});
