import { beforeAll, describe, expect, test } from "vitest";
import { humanApi, jsonBody } from "./harness";

interface AiSettings {
  provider: string;
  apiKey: string;
  hasApiKey: boolean;
  model: string;
  autoSummarize: boolean;
  baseURL: string;
  sdkType: string;
}

const emptyConfig = {
  provider: "",
  apiKey: "",
  model: "",
  autoSummarize: false,
  baseURL: "",
  sdkType: "",
};

describe("AI settings API", () => {
  beforeAll(async () => {
    await humanApi("/api/settings/ai", jsonBody("PUT", emptyConfig));
  });

  test("GET /api/settings/ai returns defaults when unconfigured", async () => {
    const res = await humanApi("/api/settings/ai");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiSettings;
    expect(body.provider).toBe("");
    expect(body.hasApiKey).toBe(false);
    expect(body.autoSummarize).toBe(false);
  });

  test("PUT /api/settings/ai saves configuration", async () => {
    const res = await humanApi(
      "/api/settings/ai",
      jsonBody("PUT", {
        provider: "anthropic",
        apiKey: "sk-test-1234567890",
        model: "claude-sonnet-4-20250514",
        autoSummarize: true,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiSettings;
    expect(body.provider).toBe("anthropic");
    expect(body.hasApiKey).toBe(true);
    expect(body.apiKey).toContain("*");
    expect(body.apiKey.endsWith("7890")).toBe(true);
    expect(body.autoSummarize).toBe(true);
  });

  test("GET /api/settings/ai returns saved config", async () => {
    const res = await humanApi("/api/settings/ai");
    const body = (await res.json()) as AiSettings;
    expect(body.provider).toBe("anthropic");
    expect(body.hasApiKey).toBe(true);
  });

  test("PUT /api/settings/ai rejects invalid provider", async () => {
    const res = await humanApi(
      "/api/settings/ai",
      jsonBody("PUT", { provider: "invalid-provider" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid provider");
  });

  test("PUT /api/settings/ai allows partial update", async () => {
    const res = await humanApi("/api/settings/ai", jsonBody("PUT", { autoSummarize: false }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiSettings;
    expect(body.provider).toBe("anthropic");
    expect(body.autoSummarize).toBe(false);
  });

  test("PUT /api/settings/ai can clear config", async () => {
    const res = await humanApi("/api/settings/ai", jsonBody("PUT", emptyConfig));
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiSettings;
    expect(body.provider).toBe("");
    expect(body.hasApiKey).toBe(false);
  });

  test("PUT /api/settings/ai accepts custom provider", async () => {
    const res = await humanApi(
      "/api/settings/ai",
      jsonBody("PUT", {
        provider: "custom",
        apiKey: "sk-custom-1234567890",
        model: "my-model-v1",
        baseURL: "https://my-api.example.com/v1",
        sdkType: "openai",
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as AiSettings;
    expect(body.provider).toBe("custom");
    expect(body.baseURL).toBe("https://my-api.example.com/v1");
    expect(body.sdkType).toBe("openai");
  });

  test("PUT /api/settings/ai rejects invalid sdkType", async () => {
    const res = await humanApi("/api/settings/ai", jsonBody("PUT", { sdkType: "invalid-sdk" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid SDK type");
  });
});

describe("AI Settings page", () => {
  test("GET /settings/ai returns 200 with heading", async () => {
    const res = await humanApi("/settings/ai");
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("AI Settings");
  });
});
