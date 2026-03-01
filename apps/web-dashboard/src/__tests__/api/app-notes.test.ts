import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/apps/notes route handler tests
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

      const req = new Request("http://localhost/api/apps/notes");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.notes).toHaveLength(2);
      expect(data.notes[0].bundleId).toBe("com.google.Chrome");
      expect(data.notes[0].note).toBe("Work browser");
      expect(data.notes[1].bundleId).toBe("com.microsoft.VSCode");
    });

    test("returns empty array when no notes exist", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/apps/notes/route");

      const req = new Request("http://localhost/api/apps/notes");
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

      const req = new Request("http://localhost/api/apps/notes", {
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
      expect(calls[0].sql).toContain("INSERT INTO app_notes");
      expect(calls[0].sql).toContain("ON CONFLICT");
    });

    test("deletes note when note is empty string", async () => {
      const { calls } = mockD1([[]]);
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = new Request("http://localhost/api/apps/notes", {
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
      expect(calls[0].sql).toContain("DELETE FROM app_notes");
    });

    test("deletes note when note is whitespace only", async () => {
      mockD1([[]]);
      const { PUT } = await import("../../app/api/apps/notes/route");

      const req = new Request("http://localhost/api/apps/notes", {
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

      const req = new Request("http://localhost/api/apps/notes", {
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

      const req = new Request("http://localhost/api/apps/notes", {
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

      const req = new Request("http://localhost/api/apps/notes", {
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

      const req = new Request("http://localhost/api/apps/notes", {
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
      // Mock D1 returning changes=1 (1 row deleted)
      const calls: Array<{ sql: string; params: unknown[] }> = [];
      globalThis.fetch = mock((_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        calls.push({ sql: body.sql, params: body.params });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              result: [
                {
                  results: [],
                  success: true,
                  meta: { changes: 1, last_row_id: 0 },
                },
              ],
              errors: [],
            }),
            { status: 200 },
          ),
        );
      }) as unknown as typeof fetch;

      const { DELETE: deleteFn } = await import("../../app/api/apps/notes/route");

      const req = new Request("http://localhost/api/apps/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: "com.google.Chrome" }),
      });

      const res = await deleteFn(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deleted).toBe(true);

      expect(calls[0].sql).toContain("DELETE FROM app_notes");
      expect(calls[0].params).toContain("com.google.Chrome");
    });

    test("returns deleted=false when note does not exist", async () => {
      // Mock D1 returning changes=0 (no rows deleted)
      globalThis.fetch = mock((_url: string, _init: RequestInit) => {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              result: [
                {
                  results: [],
                  success: true,
                  meta: { changes: 0, last_row_id: 0 },
                },
              ],
              errors: [],
            }),
            { status: 200 },
          ),
        );
      }) as unknown as typeof fetch;

      const { DELETE: deleteFn } = await import("../../app/api/apps/notes/route");

      const req = new Request("http://localhost/api/apps/notes", {
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

      const req = new Request("http://localhost/api/apps/notes", {
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

      const req = new Request("http://localhost/api/apps/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await deleteFn(req);
      expect(res.status).toBe(400);
    });
  });
});
