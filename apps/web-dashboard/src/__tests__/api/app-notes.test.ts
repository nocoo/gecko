import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/apps/notes route handler tests
// ---------------------------------------------------------------------------

describe("/api/apps/notes", () => {
  // -------------------------------------------------------------------------
  // GET
  // -------------------------------------------------------------------------
  describe("GET /api/apps/notes", () => {
    test("returns list of notes", async () => {
      mockD1([
        [
          {
            bundle_id: "com.google.Chrome",
            note: "Work browser",
            updated_at: "2026-01-15T10:00:00.000Z",
          },
          {
            bundle_id: "com.microsoft.VSCode",
            note: "Main IDE for frontend work",
            updated_at: "2026-01-14T08:00:00.000Z",
          },
        ],
      ]);
      const { GET } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.notes).toHaveLength(2);
      const n0 = data.notes[0];
      const n1 = data.notes[1];
      if (!n0 || !n1) return;
      expect(n0.bundleId).toBe("com.google.Chrome");
      expect(n0.note).toBe("Work browser");
      expect(n1.bundleId).toBe("com.microsoft.VSCode");
    });

    test("returns empty array when no notes exist", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes");
      const res = await GET(req);
      const data = await res.json();
      expect(data.notes).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // PUT
  // -------------------------------------------------------------------------
  describe("PUT /api/apps/notes", () => {
    test("upserts a note for an app", async () => {
      const { calls } = mockD1([[]]);
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: "com.google.Chrome",
          note: "Work browser for documentation",
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.bundleId).toBe("com.google.Chrome");
      expect(data.note).toBe("Work browser for documentation");

      expect(calls.length).toBe(1);
      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("INSERT INTO app_notes");
      expect(c0.sql).toContain("ON CONFLICT");
    });

    test("deletes note when note is empty string", async () => {
      const { calls } = mockD1([[]]);
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: "com.google.Chrome",
          note: "",
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deleted).toBe(true);
      expect(data.note).toBe("");

      expect(calls.length).toBe(1);
      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("DELETE FROM app_notes");
    });

    test("deletes note when note is whitespace only", async () => {
      mockD1([[]]);
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: "com.google.Chrome",
          note: "   ",
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deleted).toBe(true);
    });

    test("returns 400 when bundleId is missing", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "some note" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 when note exceeds 500 characters", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: "com.google.Chrome",
          note: "a".repeat(501),
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("500");
    });

    test("accepts note at exactly 500 characters", async () => {
      mockD1([[]]);
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: "com.google.Chrome",
          note: "a".repeat(500),
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);
    });

    test("returns 400 for invalid JSON", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------
  describe("DELETE /api/apps/notes", () => {
    test("deletes an existing note", async () => {
      const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
      const { DELETE: deleteFn } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: "com.google.Chrome" }),
      });

      const res = await deleteFn(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deleted).toBe(true);

      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("DELETE FROM app_notes");
      expect(c0.params).toContain("com.google.Chrome");
    });

    test("returns deleted=false when note does not exist", async () => {
      mockD1([{ results: [], meta: { changes: 0 } }]);
      const { DELETE: deleteFn } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: "com.nonexistent.App" }),
      });

      const res = await deleteFn(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deleted).toBe(false);
    });

    test("returns 400 when bundleId is missing", async () => {
      mockD1();
      const { DELETE: deleteFn } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await deleteFn(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 for invalid JSON", async () => {
      mockD1();
      const { DELETE: deleteFn } = await import("../../app/api/apps/notes/route");

      const req = humanRequest("http://127.0.0.1:17018/api/apps/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await deleteFn(req);
      expect(res.status).toBe(400);
    });
  });
});
