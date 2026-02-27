import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/tags/mappings route handler tests
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

describe("/api/tags/mappings", () => {
  describe("GET /api/tags/mappings", () => {
    test("returns list of mappings", async () => {
      mockD1([
        [
          {
            bundle_id: "com.google.Chrome",
            tag_id: "tag-work",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]);
      const { GET } = await import("../../app/api/tags/mappings/route");

      const req = new Request("http://localhost/api/tags/mappings");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mappings).toHaveLength(1);
      expect(data.mappings[0].bundleId).toBe("com.google.Chrome");
      expect(data.mappings[0].tagId).toBe("tag-work");
    });

    test("returns empty array when no mappings", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/tags/mappings/route");

      const req = new Request("http://localhost/api/tags/mappings");
      const res = await GET(req);
      const data = await res.json();
      expect(data.mappings).toEqual([]);
    });
  });

  describe("PUT /api/tags/mappings", () => {
    test("upserts mappings", async () => {
      const { calls } = mockD1([[]]);
      const { PUT } = await import("../../app/api/tags/mappings/route");

      const req = new Request("http://localhost/api/tags/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: [
            { bundleId: "com.google.Chrome", tagId: "tag-work" },
            { bundleId: "com.google.Chrome", tagId: "tag-social" },
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
      const { PUT } = await import("../../app/api/tags/mappings/route");

      const req = new Request("http://localhost/api/tags/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: [] }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 when tagId is missing", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/tags/mappings/route");

      const req = new Request("http://localhost/api/tags/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: [{ bundleId: "com.google.Chrome" }],
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("batches large mapping sets to respect D1 param limits", async () => {
      // 40 mappings => 2 batches (33 + 7)
      const { calls } = mockD1([[], []]);
      const { PUT } = await import("../../app/api/tags/mappings/route");

      const mappings = Array.from({ length: 40 }, (_, i) => ({
        bundleId: `com.app.${i}`,
        tagId: "tag-1",
      }));

      const req = new Request("http://localhost/api/tags/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.upserted).toBe(40);

      expect(calls.length).toBe(2);
      // First batch: 33 * 3 = 99 params
      expect(calls[0].params.length).toBe(99);
      // Second batch: 7 * 3 = 21 params
      expect(calls[1].params.length).toBe(21);
    });
  });
});
