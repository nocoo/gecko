import { afterEach, describe, expect, test } from "vitest";
import { __testOverrides } from "../setup";
import { humanRequest, mockD1 } from "../test-env";

function settingRow(key: string, value: string) {
  return { user_id: "e2e-test-user", key, value, updated_at: 1000 };
}

describe("POST /api/settings/ai/test", () => {
  afterEach(() => {
    __testOverrides.generateText = null;
  });

  test("returns 400 when provider or apiKey is missing", async () => {
    mockD1([[]]);
    const { POST } = await import("../../app/api/settings/ai/test/route");

    const res = await POST(
      humanRequest("http://127.0.0.1:17018/api/settings/ai/test", { method: "POST" }),
    );
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("AI provider and API key must be configured first");
  });

  test("returns 200 with trimmed AI response on success", async () => {
    mockD1([
      [
        settingRow("ai.provider", "anthropic"),
        settingRow("ai.apiKey", "sk-ant-test-key"),
        settingRow("ai.model", "claude-sonnet-4"),
        settingRow("ai.sdkType", "anthropic"),
        settingRow("ai.authType", "apiKey"),
      ],
    ]);
    __testOverrides.generateText = async () => ({ text: " OK \n" });

    const { POST } = await import("../../app/api/settings/ai/test/route");
    const res = await POST(
      humanRequest("http://127.0.0.1:17018/api/settings/ai/test", { method: "POST" }),
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({
      success: true,
      response: "OK",
      model: "claude-sonnet-4",
      provider: "anthropic",
    });
  });

  test("surfaces upstream statusCode and JSON error message on failure", async () => {
    mockD1([
      [
        settingRow("ai.provider", "openai"),
        settingRow("ai.apiKey", "sk-openai-bad"),
        settingRow("ai.model", "gpt-4o"),
        settingRow("ai.baseURL", "https://api.example.com/v1"),
        settingRow("ai.authType", "bearer"),
      ],
    ]);
    __testOverrides.generateText = async () => {
      const err = new Error("Request failed") as Error & {
        statusCode?: number;
        responseBody?: string;
        url?: string;
      };
      err.statusCode = 401;
      err.responseBody = JSON.stringify({ error: { message: "Invalid API key" } });
      err.url = "https://api.example.com/v1/chat/completions";
      throw err;
    };

    const { POST } = await import("../../app/api/settings/ai/test/route");
    const res = await POST(
      humanRequest("http://127.0.0.1:17018/api/settings/ai/test", { method: "POST" }),
    );
    expect(res.status).toBe(401);

    const data = await res.json();
    expect(data.error).toBe(
      "Invalid API key (upstream: https://api.example.com/v1/chat/completions)",
    );
  });

  test("falls back to 502 and raw message when upstream responseBody is not JSON", async () => {
    mockD1([[settingRow("ai.provider", "anthropic"), settingRow("ai.apiKey", "sk-ant-test-key")]]);
    __testOverrides.generateText = async () => {
      const err = new Error("Connection reset") as Error & { responseBody?: string };
      err.responseBody = "not-json";
      throw err;
    };

    const { POST } = await import("../../app/api/settings/ai/test/route");
    const res = await POST(
      humanRequest("http://127.0.0.1:17018/api/settings/ai/test", { method: "POST" }),
    );
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toBe("Connection reset");
  });
});
