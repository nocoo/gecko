/**
 * Tests for backy-repo.ts — backy config CRUD via D1 settings table.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { backyRepo } from "@/lib/backy-repo";

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
// getPushConfig
// ---------------------------------------------------------------------------

describe("backyRepo.getPushConfig", () => {
  test("returns config when both keys exist", async () => {
    const { calls } = mockD1([{
      results: [
        { key: "backy.webhookUrl", value: "https://backy.example.com/webhook" },
        { key: "backy.apiKey", value: "sk-test-123" },
      ],
    }]);

    const config = await backyRepo.getPushConfig("u1");

    expect(config).toEqual({
      webhookUrl: "https://backy.example.com/webhook",
      apiKey: "sk-test-123",
    });
    const call0 = calls[0];
    if (!call0) return;
    expect(call0.sql).toContain("backy.webhookUrl");
    expect(call0.sql).toContain("backy.apiKey");
    expect(call0.params).toEqual(["u1"]);
  });

  test("returns null when only webhookUrl exists", async () => {
    mockD1([{
      results: [
        { key: "backy.webhookUrl", value: "https://backy.example.com/webhook" },
      ],
    }]);

    const config = await backyRepo.getPushConfig("u1");
    expect(config).toBeNull();
  });

  test("returns null when no config exists", async () => {
    mockD1([{ results: [] }]);
    const config = await backyRepo.getPushConfig("u1");
    expect(config).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// savePushConfig
// ---------------------------------------------------------------------------

describe("backyRepo.savePushConfig", () => {
  test("upserts both webhookUrl and apiKey", async () => {
    const { calls } = mockD1([
      { results: [], meta: { changes: 1 } },
      { results: [], meta: { changes: 1 } },
    ]);

    await backyRepo.savePushConfig("u1", "https://backy.example.com/webhook", "sk-test-123");

    expect(calls).toHaveLength(2);
    const c0 = calls[0];
    const c1 = calls[1];
    if (!c0 || !c1) return;
    expect(c0.sql).toContain("INSERT INTO settings");
    expect(c0.sql).toContain("backy.webhookUrl");
    expect(c0.params[0]).toBe("u1");
    expect(c0.params[1]).toBe("https://backy.example.com/webhook");

    expect(c1.sql).toContain("backy.apiKey");
    expect(c1.params[0]).toBe("u1");
    expect(c1.params[1]).toBe("sk-test-123");
  });
});

// ---------------------------------------------------------------------------
// getPullKey
// ---------------------------------------------------------------------------

describe("backyRepo.getPullKey", () => {
  test("returns key when found", async () => {
    const { calls } = mockD1([{ results: [{ value: "bpk_abc123" }] }]);
    const key = await backyRepo.getPullKey("u1");

    expect(key).toBe("bpk_abc123");
    const call0 = calls[0];
    if (!call0) return;
    expect(call0.sql).toContain("backy.pullKey");
    expect(call0.params).toEqual(["u1"]);
  });

  test("returns null when not found", async () => {
    mockD1([{ results: [] }]);
    const key = await backyRepo.getPullKey("u1");
    expect(key).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// savePullKey
// ---------------------------------------------------------------------------

describe("backyRepo.savePullKey", () => {
  test("upserts the pull key", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
    await backyRepo.savePullKey("u1", "bpk_new-key");

    expect(calls).toHaveLength(1);
    const call0 = calls[0];
    if (!call0) return;
    expect(call0.sql).toContain("INSERT INTO settings");
    expect(call0.sql).toContain("backy.pullKey");
    expect(call0.params[0]).toBe("u1");
    expect(call0.params[1]).toBe("bpk_new-key");
  });
});

// ---------------------------------------------------------------------------
// deletePullKey
// ---------------------------------------------------------------------------

describe("backyRepo.deletePullKey", () => {
  test("returns true when key was deleted", async () => {
    const { calls } = mockD1([{ results: [], meta: { changes: 1 } }]);
    const result = await backyRepo.deletePullKey("u1");

    expect(result).toBe(true);
    const call0 = calls[0];
    if (!call0) return;
    expect(call0.sql).toContain("DELETE FROM settings");
    expect(call0.sql).toContain("backy.pullKey");
    expect(call0.params).toEqual(["u1"]);
  });

  test("returns false when no key existed", async () => {
    mockD1([{ results: [], meta: { changes: 0 } }]);
    const result = await backyRepo.deletePullKey("u1");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findUserByPullKey
// ---------------------------------------------------------------------------

describe("backyRepo.findUserByPullKey", () => {
  test("returns user_id when key matches", async () => {
    const { calls } = mockD1([{ results: [{ user_id: "u1" }] }]);
    const userId = await backyRepo.findUserByPullKey("bpk_abc123");

    expect(userId).toBe("u1");
    const call0 = calls[0];
    if (!call0) return;
    expect(call0.sql).toContain("backy.pullKey");
    expect(call0.params).toEqual(["bpk_abc123"]);
  });

  test("returns null when no match", async () => {
    mockD1([{ results: [] }]);
    const userId = await backyRepo.findUserByPullKey("bpk_invalid");
    expect(userId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// generatePullKey
// ---------------------------------------------------------------------------

describe("backyRepo.generatePullKey", () => {
  test("starts with bpk_ prefix", () => {
    const key = backyRepo.generatePullKey();
    expect(key.startsWith("bpk_")).toBe(true);
  });

  test("has correct length (bpk_ + 64 hex chars = 68 total)", () => {
    const key = backyRepo.generatePullKey();
    expect(key).toHaveLength(68);
  });

  test("hex portion is valid hex", () => {
    const key = backyRepo.generatePullKey();
    const hex = key.slice(4);
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });

  test("generates unique keys", () => {
    const keys = new Set(Array.from({ length: 10 }, () => backyRepo.generatePullKey()));
    expect(keys.size).toBe(10);
  });
});
