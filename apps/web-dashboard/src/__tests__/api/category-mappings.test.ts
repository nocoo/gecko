import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/categories/mappings route handler tests
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
              meta: { changes: results.length, last_row_id: 0 },
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

describe("/api/categories/mappings", () => {
  describe("GET /api/categories/mappings", () => {
    test("returns list of mappings", async () => {
      mockD1([
        [
          {
            bundle_id: "com.google.Chrome",
            category_id: "cat-browser",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]);
      const { GET } = await import(
        "../../app/api/categories/mappings/route"
      );

      const req = new Request("http://localhost/api/categories/mappings");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mappings).toHaveLength(1);
      expect(data.mappings[0].bundleId).toBe("com.google.Chrome");
      expect(data.mappings[0].categoryId).toBe("cat-browser");
    });

    test("returns empty array when no mappings", async () => {
      mockD1([[]]);
      const { GET } = await import(
        "../../app/api/categories/mappings/route"
      );

      const req = new Request("http://localhost/api/categories/mappings");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mappings).toEqual([]);
    });
  });

  describe("PUT /api/categories/mappings", () => {
    test("upserts mappings", async () => {
      const { calls } = mockD1([[]]);
      const { PUT } = await import(
        "../../app/api/categories/mappings/route"
      );

      const req = new Request("http://localhost/api/categories/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: [
            { bundleId: "com.google.Chrome", categoryId: "cat-browser" },
            { bundleId: "com.apple.Safari", categoryId: "cat-browser" },
          ],
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.upserted).toBe(2);

      expect(calls.length).toBe(1);
      expect(calls[0].sql).toContain("INSERT OR REPLACE");
    });

    test("returns 400 when mappings array is empty", async () => {
      mockD1();
      const { PUT } = await import(
        "../../app/api/categories/mappings/route"
      );

      const req = new Request("http://localhost/api/categories/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: [] }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 when bundleId is missing", async () => {
      mockD1();
      const { PUT } = await import(
        "../../app/api/categories/mappings/route"
      );

      const req = new Request("http://localhost/api/categories/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: [{ categoryId: "cat-browser" }],
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("batches large mapping sets to respect D1 param limits", async () => {
      // 30 mappings => 2 batches (25 + 5), each INSERT OR REPLACE
      const { calls } = mockD1([[], []]);
      const { PUT } = await import(
        "../../app/api/categories/mappings/route"
      );

      const mappings = Array.from({ length: 30 }, (_, i) => ({
        bundleId: `com.app.${i}`,
        categoryId: "cat-1",
      }));

      const req = new Request("http://localhost/api/categories/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.upserted).toBe(30);

      // Should have been 2 separate D1 calls
      expect(calls.length).toBe(2);
      // First batch: 25 * 3 params = 75
      expect(calls[0].params.length).toBe(75);
      // Second batch: 5 * 3 params = 15
      expect(calls[1].params.length).toBe(15);
    });
  });
});
