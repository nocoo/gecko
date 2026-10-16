import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/tags/mappings route handler tests
// ---------------------------------------------------------------------------

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

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.mappings).toHaveLength(1);
      const m0 = data.mappings[0];
      if (!m0) return;
      expect(m0.bundleId).toBe("com.google.Chrome");
      expect(m0.tagId).toBe("tag-work");
    });

    test("returns empty array when no mappings", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/tags/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings");
      const res = await GET(req);
      const data = await res.json();
      expect(data.mappings).toEqual([]);
    });
  });

  describe("PUT /api/tags/mappings", () => {
    test("upserts mappings", async () => {
      const { calls } = mockD1([[]]);
      const { PUT } = await import("../../app/api/tags/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
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
      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("INSERT OR REPLACE");
    });

    test("returns 400 when mappings array is empty", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/tags/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
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

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
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

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.upserted).toBe(40);

      expect(calls.length).toBe(2);
      const c0 = calls[0];
      const c1 = calls[1];
      if (!c0 || !c1) return;
      // First batch: 33 * 3 = 99 params
      expect(c0.params.length).toBe(99);
      // Second batch: 7 * 3 = 21 params
      expect(c1.params.length).toBe(21);
    });
  });

  // -------------------------------------------------------------------------
  // POST — replace all tags for given apps
  // -------------------------------------------------------------------------
  describe("POST /api/tags/mappings", () => {
    test("replaces all tags for a single app", async () => {
      // Response 1: DELETE existing
      // Response 2: INSERT new tags
      const { calls } = mockD1([[], []]);
      const { POST } = await import("../../app/api/tags/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: [
            {
              bundleId: "com.google.Chrome",
              tagIds: ["tag-work", "tag-browser"],
            },
          ],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.updated).toBe(1);

      // First call: DELETE
      const call0 = calls[0];
      const call1 = calls[1];
      if (!call0 || !call1) return;
      expect(call0.sql).toContain("DELETE FROM app_tag_mappings");
      expect(call0.params).toContain("com.google.Chrome");

      // Second call: INSERT 2 tags
      expect(call1.sql).toContain("INSERT OR REPLACE");
      expect(call1.params).toHaveLength(6); // 2 tags × 3 params
    });

    test("removes all tags when tagIds is empty", async () => {
      const { calls } = mockD1([[]]);
      const { POST } = await import("../../app/api/tags/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: [{ bundleId: "com.google.Chrome", tagIds: [] }],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      // Only DELETE, no INSERT
      expect(calls).toHaveLength(1);
      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("DELETE");
    });

    test("handles multiple apps", async () => {
      // App 1: DELETE + INSERT (2 calls)
      // App 2: DELETE + INSERT (2 calls)
      const { calls } = mockD1([[], [], [], []]);
      const { POST } = await import("../../app/api/tags/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: [
            { bundleId: "com.google.Chrome", tagIds: ["tag-1"] },
            { bundleId: "com.apple.Safari", tagIds: ["tag-2"] },
          ],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.updated).toBe(2);
      expect(calls).toHaveLength(4);
    });

    test("returns 400 when apps array is empty", async () => {
      mockD1();
      const { POST } = await import("../../app/api/tags/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apps: [] }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 when bundleId is missing", async () => {
      mockD1();
      const { POST } = await import("../../app/api/tags/mappings/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apps: [{ tagIds: ["tag-1"] }],
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });
});
