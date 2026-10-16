import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/tags route handler tests
// ---------------------------------------------------------------------------

describe("/api/tags", () => {
  describe("GET /api/tags", () => {
    test("returns list of tags", async () => {
      mockD1([
        [
          {
            id: "tag-1",
            name: "work",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]);
      const { GET } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.tags).toHaveLength(1);
      expect(data.tags[0].name).toBe("work");
    });

    test("returns empty array when no tags", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags");
      const res = await GET(req);
      const data = await res.json();
      expect(data.tags).toEqual([]);
    });
  });

  describe("POST /api/tags", () => {
    test("creates a new tag", async () => {
      const { calls } = mockD1([[]]);
      const { POST } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "productivity" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.id).toBeTruthy();
      expect(data.name).toBe("productivity");

      expect(calls.length).toBe(1);
      expect(calls[0]).toBeDefined();
      if (!calls[0]) return;
      expect(calls[0].sql).toContain("INSERT INTO tags");
    });

    test("returns 400 when name is missing", async () => {
      mockD1();
      const { POST } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 when body is not valid JSON", async () => {
      mockD1();
      const { POST } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON body");
    });
  });

  describe("PUT /api/tags", () => {
    test("renames a tag", async () => {
      mockD1([[{ id: "tag-1", user_id: "e2e-test-user" }], []]);
      const { PUT } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "tag-1", name: "focus" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.name).toBe("focus");
    });

    test("returns 404 when tag not found", async () => {
      mockD1([[]]);
      const { PUT } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "nonexistent", name: "x" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(404);
    });

    test("returns 400 when name is missing", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "tag-1" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 when body is not valid JSON", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON body");
    });

    test("returns 400 when id is missing", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "x" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("returns 404 when tag belongs to another user", async () => {
      mockD1([[{ id: "tag-1", user_id: "other-user" }]]);
      const { PUT } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "tag-1", name: "stolen" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/tags", () => {
    test("deletes a tag and its mappings", async () => {
      mockD1([
        [{ id: "tag-1", user_id: "e2e-test-user" }],
        [], // delete mappings
        [], // delete tag
      ]);
      const { DELETE } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "tag-1" }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deleted).toBe(true);
    });

    test("returns 404 when tag not found", async () => {
      mockD1([[]]);
      const { DELETE } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "nonexistent" }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(404);
    });

    test("returns 400 when body is not valid JSON", async () => {
      mockD1();
      const { DELETE } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await DELETE(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid JSON body");
    });

    test("returns 400 when id is missing", async () => {
      mockD1();
      const { DELETE } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(400);
    });

    test("returns 404 when tag belongs to another user", async () => {
      mockD1([[{ id: "tag-1", user_id: "other-user" }]]);
      const { DELETE } = await import("../../app/api/tags/route");

      const req = humanRequest("http://127.0.0.1:17018/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "tag-1" }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(404);
    });
  });
});
