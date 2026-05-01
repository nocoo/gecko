/**
 * Tests for settings-repo.ts — key-value CRUD via D1 REST API.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { settingsRepo } from "@/lib/settings-repo";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockD1(responses: Array<{ results: unknown[]; meta?: { changes: number } }>) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    const resp = responses[callIndex] ?? { results: [], meta: { changes: 0 } };
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results: resp.results, success: true, meta: resp.meta ?? { changes: 0, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

// ---------------------------------------------------------------------------
// findByUserId
// ---------------------------------------------------------------------------

describe("settingsRepo.findByUserId", () => {
  test("returns all settings for a user", async () => {
    const rows = [
      { user_id: "u1", key: "timezone", value: "Asia/Shanghai", updated_at: 100 },
      { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 200 },
    ];
    const { calls } = mockD1([{ results: rows }]);
    const result = await settingsRepo.findByUserId("u1");

    expect(result).toEqual(rows);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("SELECT");
    expect(c0.params).toEqual(["u1"]);
  });

  test("returns empty array when no settings", async () => {
    mockD1([{ results: [] }]);
    const result = await settingsRepo.findByUserId("u-none");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// findByKey
// ---------------------------------------------------------------------------

describe("settingsRepo.findByKey", () => {
  test("returns the setting when found", async () => {
    const row = { user_id: "u1", key: "timezone", value: "America/New_York", updated_at: 100 };
    const { calls } = mockD1([{ results: [row] }]);
    const result = await settingsRepo.findByKey("u1", "timezone");

    expect(result).toEqual(row);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.params).toEqual(["u1", "timezone"]);
  });

  test("returns undefined when not found", async () => {
    mockD1([{ results: [] }]);
    const result = await settingsRepo.findByKey("u1", "nonexistent");
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// upsert
// ---------------------------------------------------------------------------

describe("settingsRepo.upsert", () => {
  test("executes INSERT with ON CONFLICT", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
    await settingsRepo.upsert("u1", "timezone", "UTC");

    expect(calls).toHaveLength(1);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("INSERT INTO settings");
    expect(c0.sql).toContain("ON CONFLICT");
    expect(c0.params[0]).toBe("u1");
    expect(c0.params[1]).toBe("timezone");
    expect(c0.params[2]).toBe("UTC");
  });
});

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe("settingsRepo.delete", () => {
  test("returns true when row deleted", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
    const result = await settingsRepo.delete("u1", "timezone");

    expect(result).toBe(true);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("DELETE FROM settings");
    expect(c0.params).toEqual(["u1", "timezone"]);
  });

  test("returns false when no row found", async () => {
    mockD1([{ results: [], meta: { changes: 0 } }]);
    const result = await settingsRepo.delete("u1", "nonexistent");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// deleteByUserId
// ---------------------------------------------------------------------------

describe("settingsRepo.deleteByUserId", () => {
  test("returns number of deleted rows", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 3 } }]);
    const result = await settingsRepo.deleteByUserId("u1");

    expect(result).toBe(3);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("DELETE FROM settings WHERE user_id = ?");
    expect(c0.params).toEqual(["u1"]);
  });

  test("returns 0 when user has no settings", async () => {
    mockD1([{ results: [], meta: { changes: 0 } }]);
    const result = await settingsRepo.deleteByUserId("u-none");
    expect(result).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// findUserIdsByKeyValue
// ---------------------------------------------------------------------------

describe("settingsRepo.findUserIdsByKeyValue", () => {
  test("returns user IDs matching key=value", async () => {
    const rows = [{ user_id: "u1" }, { user_id: "u2" }];
    const { calls } = mockD1([{ results: rows }]);
    const result = await settingsRepo.findUserIdsByKeyValue("ai.autoSummarize", "true");

    expect(result).toEqual(["u1", "u2"]);
    const c0 = calls[0];
    if (!c0) return;
    expect(c0.sql).toContain("SELECT DISTINCT user_id FROM settings");
    expect(c0.params).toEqual(["ai.autoSummarize", "true"]);
  });

  test("returns empty array when no match", async () => {
    mockD1([{ results: [] }]);
    const result = await settingsRepo.findUserIdsByKeyValue("ai.autoSummarize", "true");
    expect(result).toEqual([]);
  });
});
