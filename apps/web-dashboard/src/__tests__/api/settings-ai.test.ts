import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// /api/settings/ai route handler tests
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

  globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
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
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

function settingRow(key: string, value: string) {
  return { user_id: "e2e-test-user", key, value, updated_at: 1000 };
}

describe("/api/settings/ai", () => {
  describe("GET", () => {
    test("returns AI settings with masked apiKey", async () => {
      mockD1([
        [
          settingRow("ai.provider", "anthropic"),
          settingRow("ai.apiKey", "sk-ant-secret123"),
          settingRow("ai.model", "claude-sonnet-4"),
          settingRow("ai.autoSummarize", "true"),
        ],
      ]);
      const { GET } = await import("../../app/api/settings/ai/route");

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.provider).toBe("anthropic");
      expect(data.model).toBe("claude-sonnet-4");
      expect(data.autoSummarize).toBe(true);
      expect(data.hasApiKey).toBe(true);
      // Last 4 chars revealed, rest masked
      expect(data.apiKey).toMatch(/\*+t123$/);
    });

    test("returns empty defaults when no settings", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/settings/ai/route");

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.provider).toBe("");
      expect(data.apiKey).toBe("");
      expect(data.hasApiKey).toBe(false);
      expect(data.autoSummarize).toBe(false);
    });
  });

  describe("PUT", () => {
    test("rejects invalid provider", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/ai/route");

      const req = new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "no-such-provider" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("Invalid provider");
    });

    test("rejects invalid sdkType", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/ai/route");

      const req = new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdkType: "weird" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);

      const data = await res.json();
      expect(data.error).toContain("Invalid SDK type");
    });

    test("rejects invalid JSON body", async () => {
      mockD1([]);
      const { PUT } = await import("../../app/api/settings/ai/route");

      const req = new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });

      const res = await PUT(req);
      expect(res.status).toBe(400);
    });

    test("upserts provided fields and returns updated settings with masked key", async () => {
      const { calls } = mockD1([
        // Each upsert returns no rows. Then final readAiSettings findByUserId.
        [], // upsert provider
        [], // upsert apiKey
        [], // upsert model
        [
          settingRow("ai.provider", "anthropic"),
          settingRow("ai.apiKey", "sk-final-key-1234"),
          settingRow("ai.model", "claude-sonnet-4"),
        ],
      ]);
      const { PUT } = await import("../../app/api/settings/ai/route");

      const req = new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "anthropic",
          apiKey: "sk-final-key-1234",
          model: "claude-sonnet-4",
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.provider).toBe("anthropic");
      expect(data.model).toBe("claude-sonnet-4");
      expect(data.hasApiKey).toBe(true);
      expect(data.apiKey).toMatch(/\*+1234$/);

      // 3 upserts + 1 read
      expect(calls.length).toBe(4);
    });

    test("deletes prompt section when set to empty string", async () => {
      const { calls } = mockD1([
        [], // delete promptSection1
        [], // final read
      ]);
      const { PUT } = await import("../../app/api/settings/ai/route");

      const req = new Request("http://localhost/api/settings/ai", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promptSection1: "" }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      // First call should be a DELETE for the prompt section
      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("DELETE");
      expect(c0.params).toContain("ai.prompt.section1");
    });
  });
});
