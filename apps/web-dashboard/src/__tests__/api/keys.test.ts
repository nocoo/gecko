import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/keys route handler tests
// Uses E2E_SKIP_AUTH=true to bypass session auth.
// Mocks D1 client to avoid real Cloudflare calls.
// ---------------------------------------------------------------------------

// Save originals
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

// Mock D1 to track queries
function mockD1(responses: unknown[][] = [[]]) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = mock((url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    const results = responses[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: results.length, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 }
      )
    );
  }) as unknown as typeof fetch;

  return { calls };
}

describe("/api/keys", () => {
  // ---------------------------------------------------------------------------
  // POST /api/keys — Generate API key
  // ---------------------------------------------------------------------------

  describe("POST /api/keys", () => {
    test("generates new API key and returns it", async () => {
      const { calls } = mockD1([[]]);
      const { POST } = await import("../../app/api/keys/route");

      const req = new Request("http://localhost/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "MacBook Pro" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const data = await res.json();
      expect(data.key).toMatch(/^gk_[0-9a-f]{64}$/);
      expect(data.deviceId).toBeTruthy();
      expect(data.name).toBe("MacBook Pro");

      // Should have made an INSERT query
      expect(calls.length).toBe(1);
      expect(calls[0].sql).toContain("INSERT INTO api_keys");
    });

    test("returns 400 when name is missing", async () => {
      mockD1();
      const { POST } = await import("../../app/api/keys/route");

      const req = new Request("http://localhost/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("name");
    });

    test("returns 400 when name is empty string", async () => {
      mockD1();
      const { POST } = await import("../../app/api/keys/route");

      const req = new Request("http://localhost/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "  " }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/keys — List API keys
  // ---------------------------------------------------------------------------

  describe("GET /api/keys", () => {
    test("returns list of user's API keys (without hashes)", async () => {
      mockD1([
        [
          {
            id: "key-1",
            name: "MacBook Pro",
            device_id: "dev-1",
            created_at: "2026-01-01T00:00:00.000Z",
            last_used: "2026-01-02T00:00:00.000Z",
          },
          {
            id: "key-2",
            name: "Mac Mini",
            device_id: "dev-2",
            created_at: "2026-01-03T00:00:00.000Z",
            last_used: null,
          },
        ],
      ]);
      const { GET } = await import("../../app/api/keys/route");

      const req = new Request("http://localhost/api/keys");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.keys).toHaveLength(2);
      expect(data.keys[0].name).toBe("MacBook Pro");
      expect(data.keys[0].deviceId).toBe("dev-1");
      // key_hash should NOT be exposed
      expect(data.keys[0].keyHash).toBeUndefined();
      expect(data.keys[0].key_hash).toBeUndefined();
    });

    test("returns empty array when no keys", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/keys/route");

      const req = new Request("http://localhost/api/keys");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.keys).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/keys/[id] — Revoke API key
// ---------------------------------------------------------------------------

describe("/api/keys/[id]", () => {
  describe("DELETE /api/keys/[id]", () => {
    test("deletes user's API key", async () => {
      // First query: check key exists and belongs to user
      // Second query: delete the key
      const { calls } = mockD1([
        [{ id: "key-1", user_id: "e2e-test-user" }],
        [],
      ]);
      const { DELETE } = await import("../../app/api/keys/[id]/route");

      const req = new Request("http://localhost/api/keys/key-1", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "key-1" }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.deleted).toBe(true);
    });

    test("returns 404 when key does not exist", async () => {
      mockD1([[]]);
      const { DELETE } = await import("../../app/api/keys/[id]/route");

      const req = new Request("http://localhost/api/keys/nonexistent", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "nonexistent" }) });
      expect(res.status).toBe(404);
    });

    test("returns 404 when key belongs to different user", async () => {
      mockD1([[{ id: "key-1", user_id: "other-user" }]]);
      const { DELETE } = await import("../../app/api/keys/[id]/route");

      const req = new Request("http://localhost/api/keys/key-1", {
        method: "DELETE",
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: "key-1" }) });
      expect(res.status).toBe(404);
    });
  });
});
