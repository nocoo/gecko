import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/categories route handler tests
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

describe("/api/categories", () => {
  // -------------------------------------------------------------------------
  // GET — list categories for the current user
  // -------------------------------------------------------------------------
  describe("GET /api/categories", () => {
    test("returns list of categories (existing user, seeding skipped)", async () => {
      mockD1([
        // seedDefaultCategories: COUNT query — user already has categories
        [{ cnt: 1 }],
        // Main SELECT query
        [
          {
            id: "cat-1",
            user_id: "e2e-test-user",
            title: "Browser",
            icon: "globe",
            is_default: 1,
            slug: "browser",
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ],
      ]);
      const { GET } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.categories).toHaveLength(1);
      expect(data.categories[0].title).toBe("Browser");
      expect(data.categories[0].icon).toBe("globe");
      expect(data.categories[0].isDefault).toBe(true);
    });

    test("seeds defaults on first access when user has no categories", async () => {
      // We need to import the constants to calculate batch count
      const { BUNDLE_ID_MAPPINGS } = await import("../../lib/default-categories");
      const mappingBatches = Math.ceil(BUNDLE_ID_MAPPINGS.size / 25);

      const { calls } = mockD1([
        // seedDefaultCategories: COUNT query — 0 categories
        [{ cnt: 0 }],
        // seedDefaultCategories: INSERT categories
        [],
        // seedDefaultCategories: INSERT mapping batches
        ...Array(mappingBatches).fill([]),
        // Main SELECT query — returns the newly seeded defaults
        [
          { id: "cat-1", title: "System Core", icon: "cpu", is_default: 1, slug: "system-core", created_at: "2026-01-01T00:00:00.000Z" },
          { id: "cat-2", title: "System App", icon: "monitor", is_default: 1, slug: "system-app", created_at: "2026-01-01T00:00:00.000Z" },
          { id: "cat-3", title: "Browser", icon: "globe", is_default: 1, slug: "browser", created_at: "2026-01-01T00:00:00.000Z" },
          { id: "cat-4", title: "Application", icon: "app-window", is_default: 1, slug: "application", created_at: "2026-01-01T00:00:00.000Z" },
        ],
      ]);
      const { GET } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.categories).toHaveLength(4);
      expect(data.categories.every((c: { isDefault: boolean }) => c.isDefault)).toBe(true);

      // Verify seeding was triggered: COUNT + INSERT categories + mapping batches + SELECT
      expect(calls[0].sql).toContain("COUNT(*)");
      expect(calls[1].sql).toContain("INSERT INTO categories");
    });
  });

  // -------------------------------------------------------------------------
  // POST — create a custom category
  // -------------------------------------------------------------------------
  describe("POST /api/categories", () => {
    test("creates a new custom category", async () => {
      const { calls } = mockD1([[]]);
      const { POST } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Productivity", icon: "folder" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.id).toBeTruthy();
      expect(data.title).toBe("Productivity");
      expect(data.icon).toBe("folder");
      expect(data.slug).toBe("productivity");
      expect(data.isDefault).toBe(false);

      expect(calls.length).toBe(1);
      expect(calls[0].sql).toContain("INSERT INTO categories");
    });

    test("returns 400 when title is missing", async () => {
      mockD1();
      const { POST } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    test("returns 400 when title is empty", async () => {
      mockD1();
      const { POST } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "  " }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    test("defaults icon to folder when not provided", async () => {
      mockD1([[]]);
      const { POST } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Work" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.icon).toBe("folder");
    });

    test("generates slug from title", async () => {
      mockD1([[]]);
      const { POST } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Dev Tools" }),
      });

      const res = await POST(req);
      const data = await res.json();
      expect(data.slug).toBe("dev-tools");
    });
  });

  // -------------------------------------------------------------------------
  // PUT — update a custom category
  // -------------------------------------------------------------------------
  describe("PUT /api/categories", () => {
    test("updates title and icon of a custom category", async () => {
      mockD1([
        // First call: check ownership + not default
        [{ id: "cat-1", user_id: "e2e-test-user", is_default: 0 }],
        // Second call: UPDATE
        [],
      ]);
      const { PUT } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "cat-1",
          title: "Updated Name",
          icon: "monitor",
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.title).toBe("Updated Name");
    });

    test("returns 400 when id is missing", async () => {
      mockD1();
      const { PUT } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("returns 403 when trying to edit a default category", async () => {
      mockD1([
        [{ id: "cat-1", user_id: "e2e-test-user", is_default: 1 }],
      ]);
      const { PUT } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cat-1", title: "Hacked" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(403);
    });

    test("returns 404 when category not found or belongs to other user", async () => {
      mockD1([[]]);
      const { PUT } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "nonexistent", title: "X" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(404);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE — remove a custom category
  // -------------------------------------------------------------------------
  describe("DELETE /api/categories", () => {
    test("deletes a custom category", async () => {
      mockD1([
        // Check ownership + not default
        [{ id: "cat-1", user_id: "e2e-test-user", is_default: 0 }],
        // Delete mappings
        [],
        // Delete category
        [],
      ]);
      const { DELETE } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cat-1" }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deleted).toBe(true);
    });

    test("returns 403 when trying to delete a default category", async () => {
      mockD1([
        [{ id: "cat-1", user_id: "e2e-test-user", is_default: 1 }],
      ]);
      const { DELETE } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "cat-1" }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(403);
    });

    test("returns 404 when category not found", async () => {
      mockD1([[]]);
      const { DELETE } = await import("../../app/api/categories/route");

      const req = new Request("http://localhost/api/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "nonexistent" }),
      });

      const res = await DELETE(req);
      expect(res.status).toBe(404);
    });
  });
});
