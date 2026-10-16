import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/settings/ai route handler tests
// ---------------------------------------------------------------------------

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

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
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

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
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

      const req = humanRequest("http://127.0.0.1:17018/api/settings/ai", {
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

      const req = humanRequest("http://127.0.0.1:17018/api/settings/ai", {
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

      const req = humanRequest("http://127.0.0.1:17018/api/settings/ai", {
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

      const req = humanRequest("http://127.0.0.1:17018/api/settings/ai", {
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

      const req = humanRequest("http://127.0.0.1:17018/api/settings/ai", {
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
