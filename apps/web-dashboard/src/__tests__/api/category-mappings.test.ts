import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/categories/mappings route handler tests
// ---------------------------------------------------------------------------

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
      const { GET } = await import("../../app/api/categories/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/categories/mappings");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mappings).toHaveLength(1);
      expect(data.mappings[0].bundleId).toBe("com.google.Chrome");
      expect(data.mappings[0].categoryId).toBe("cat-browser");
    });

    test("returns empty array when no mappings", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/categories/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/categories/mappings");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mappings).toEqual([]);
    });
  });

  describe("PUT /api/categories/mappings", () => {
    test("upserts mappings", async () => {
      const { calls } = mockD1([[]]);
      const { PUT } = await import("../../app/api/categories/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/categories/mappings", {
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
      expect(calls[0]).toBeDefined();
      if (!calls[0]) return;
      expect(calls[0].sql).toContain("INSERT OR REPLACE");
    });

    test("returns 400 when mappings array is empty", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/categories/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/categories/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: [] }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 when bundleId is missing", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/categories/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/categories/mappings", {
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
      const { PUT } = await import("../../app/api/categories/mappings/route");

      const mappings = Array.from({ length: 30 }, (_, i) => ({
        bundleId: `com.app.${i}`,
        categoryId: "cat-1",
      }));

      const req = humanRequest("http://127.0.0.1:17018/api/categories/mappings", {
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
      expect(calls[0]).toBeDefined();
      if (!calls[0]) return;
      expect(calls[0].params.length).toBe(75);
      // Second batch: 5 * 3 params = 15
      expect(calls[1]).toBeDefined();
      if (!calls[1]) return;
      expect(calls[1].params.length).toBe(15);
    });
  });
});
