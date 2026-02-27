import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/tags route handler tests
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

      const req = new Request("http://localhost/api/tags");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.tags).toHaveLength(1);
      expect(data.tags[0].name).toBe("work");
    });

    test("returns empty array when no tags", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/tags/route");

      const req = new Request("http://localhost/api/tags");
      const res = await GET(req);
      const data = await res.json();
      expect(data.tags).toEqual([]);
    });
  });

  describe("POST /api/tags", () => {
    test("creates a new tag", async () => {
      const { calls } = mockD1([[]]);
      const { POST } = await import("../../app/api/tags/route");

      const req = new Request("http://localhost/api/tags", {
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
      expect(calls[0].sql).toContain("INSERT INTO tags");
    });

    test("returns 400 when name is missing", async () => {
      mockD1();
      const { POST } = await import("../../app/api/tags/route");

      const req = new Request("http://localhost/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  describe("PUT /api/tags", () => {
    test("renames a tag", async () => {
      mockD1([
        [{ id: "tag-1", user_id: "e2e-test-user" }],
        [],
      ]);
      const { PUT } = await import("../../app/api/tags/route");

      const req = new Request("http://localhost/api/tags", {
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

      const req = new Request("http://localhost/api/tags", {
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

      const req = new Request("http://localhost/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "tag-1" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
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

      const req = new Request("http://localhost/api/tags", {
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

      const req = new Request("http://localhost/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "nonexistent" }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(404);
    });
  });
});
