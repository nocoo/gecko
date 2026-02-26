import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { query, execute, getD1Config } from "../../lib/d1";

// ---------------------------------------------------------------------------
// D1 client tests — unit tests with mocked fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// Helper: mock fetch to return a D1 response
function mockFetch(result: unknown[], success = true, status = 200) {
  globalThis.fetch = mock(() =>
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

      const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
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

      const fetchMock = globalThis.fetch as ReturnType<typeof mock>;
      const body = JSON.parse(
        (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string
      );
      expect(body.params).toEqual([]);
    });

    test("throws on D1 API error response", async () => {
      mockFetch([], false, 200);

      expect(query("BAD SQL")).rejects.toThrow("D1 query failed");
    });

    test("throws on HTTP error (non-200)", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(new Response("Internal Server Error", { status: 500 }))
      ) as unknown as typeof fetch;

      expect(query("SELECT 1")).rejects.toThrow("D1 API error (500)");
    });

    test("throws on network error", async () => {
      globalThis.fetch = mock(() =>
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
      globalThis.fetch = mock(() =>
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
      expect(users[0].id).toBe("1");
      expect(users[0].name).toBe("Alice");
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
  });
});
