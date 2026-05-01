/**
 * Tests for /api/backy/pull-key — Pull key management endpoints.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

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

/** D1 response builder */
function d1Resp(results: unknown[], changes = 0) {
  return JSON.stringify({
    success: true,
    result: [{ results, success: true, meta: { changes, last_row_id: 0 } }],
    errors: [],
  });
}

/**
 * Mock fetch for D1 calls. Tracks SQL queries for assertion.
 */
function mockD1(handler: (sql: string, params: unknown[]) => { results: unknown[]; changes?: number }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse((init?.body ?? "") as string);
    calls.push({ sql: body.sql, params: body.params });
    const { results, changes } = handler(body.sql, body.params);
    return new Response(d1Resp(results, changes ?? 0), { status: 200 });
  }) as unknown as typeof fetch;

  return { calls };
}

// ---------------------------------------------------------------------------
// GET /api/backy/pull-key
// ---------------------------------------------------------------------------

describe("GET /api/backy/pull-key", () => {
  test("returns exists:false when no pull key set", async () => {
    mockD1(() => ({ results: [] }));

    const { GET } = await import("../../app/api/backy/pull-key/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exists).toBe(false);
    expect(data.maskedKey).toBeNull();
  });

  test("returns masked key when pull key exists", async () => {
    const pullKey = "bpk_" + "ab".repeat(32); // 68 chars total

    mockD1((sql) => {
      if (sql.includes("backy.pullKey")) {
        return { results: [{ value: pullKey }] };
      }
      return { results: [] };
    });

    const { GET } = await import("../../app/api/backy/pull-key/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exists).toBe(true);
    expect(data.maskedKey).toBeTruthy();
    // Should start with "bpk_" and end with last 8 chars
    expect(data.maskedKey).toMatch(/^bpk_/);
    expect(data.maskedKey).toContain("•");
    expect(data.maskedKey).toMatch(/abababab$/);
    // Full key should NOT be returned
    expect(data.maskedKey).not.toBe(pullKey);
  });
});

// ---------------------------------------------------------------------------
// POST /api/backy/pull-key
// ---------------------------------------------------------------------------

describe("POST /api/backy/pull-key", () => {
  test("generates and returns a new pull key", async () => {
    const { calls } = mockD1(() => ({ results: [], changes: 1 }));

    const { POST } = await import("../../app/api/backy/pull-key/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.key).toBeTruthy();
    expect(data.key).toMatch(/^bpk_[0-9a-f]{64}$/);

    // Verify it called D1 to save the key
    expect(calls.some((c) => c.sql.includes("backy.pullKey"))).toBe(true);
  });

  test("each call generates a unique key", async () => {
    mockD1(() => ({ results: [], changes: 1 }));

    const { POST } = await import("../../app/api/backy/pull-key/route");
    const res1 = await POST();
    const res2 = await POST();

    const data1 = await res1.json();
    const data2 = await res2.json();
    expect(data1.key).not.toBe(data2.key);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/backy/pull-key
// ---------------------------------------------------------------------------

describe("DELETE /api/backy/pull-key", () => {
  test("returns revoked:true when key existed", async () => {
    mockD1(() => ({ results: [], changes: 1 }));

    const { DELETE } = await import("../../app/api/backy/pull-key/route");
    const res = await DELETE();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revoked).toBe(true);
  });

  test("returns revoked:false when no key existed", async () => {
    mockD1(() => ({ results: [], changes: 0 }));

    const { DELETE } = await import("../../app/api/backy/pull-key/route");
    const res = await DELETE();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.revoked).toBe(false);
  });
});
