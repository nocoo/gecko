// E2E: AI Settings API round-trip.
//
// Runs against the dev:e2e server (port 10728, E2E_SKIP_AUTH=true).
// Spawns the server, waits for readiness, runs BDD-style scenarios, then shuts down.
//
// IMPORTANT: Skipped unless explicitly invoked via `bun run test:e2e`.
// Set RUN_E2E=true to run these in the general test suite.

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { spawn, type Subprocess } from "bun";

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const SHOULD_RUN = process.env.RUN_E2E === "true";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost:10728";
const STARTUP_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Server lifecycle
// ---------------------------------------------------------------------------

let server: Subprocess | null = null;

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status > 0) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

beforeAll(async () => {
  if (!SHOULD_RUN) return;

  // Check if server is already running
  try {
    const res = await fetch(`${BASE_URL}/api/settings/ai`);
    if (res.status > 0) {
      console.log("[E2E] Server already running on port 10728");
      return;
    }
  } catch {
    // Not running — start it
  }

  console.log("[E2E] Starting dev:e2e server...");
  server = spawn({
    cmd: ["bun", "run", "dev:e2e"],
    cwd: new URL("../../..", import.meta.url).pathname.replace(/\/$/, ""),
    stdout: "ignore",
    stderr: "ignore",
  });

  await waitForServer(`${BASE_URL}/api/settings/ai`, STARTUP_TIMEOUT_MS);
  console.log("[E2E] Server ready");
});

afterAll(async () => {
  if (!SHOULD_RUN) return;

  // Clean up AI settings
  try {
    await fetch(`${BASE_URL}/api/settings/ai`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "",
        apiKey: "",
        model: "",
        autoSummarize: false,
        baseURL: "",
        sdkType: "",
      }),
    });
  } catch {
    // Ignore cleanup errors
  }

  if (server) {
    server.kill();
    server = null;
    console.log("[E2E] Server stopped");
  }
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AiSettings {
  provider: string;
  apiKey: string;
  hasApiKey: boolean;
  model: string;
  autoSummarize: boolean;
  baseURL: string;
  sdkType: string;
}

// ---------------------------------------------------------------------------
// AI Settings API
// ---------------------------------------------------------------------------

describe("AI settings API", () => {
  test.skipIf(!SHOULD_RUN)(
    "GET /api/settings/ai returns defaults when unconfigured",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as AiSettings;
      expect(body.provider).toBe("");
      expect(body.apiKey).toBe("");
      expect(body.hasApiKey).toBe(false);
      expect(body.model).toBe("");
      expect(body.autoSummarize).toBe(false);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/settings/ai saves configuration",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "anthropic",
          apiKey: "sk-test-1234567890",
          model: "claude-sonnet-4-20250514",
          autoSummarize: true,
        }),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as AiSettings;
      expect(body.provider).toBe("anthropic");
      expect(body.hasApiKey).toBe(true);
      // API key should be masked
      expect(body.apiKey).toContain("*");
      expect(body.apiKey).toEndWith("7890");
      expect(body.model).toBe("claude-sonnet-4-20250514");
      expect(body.autoSummarize).toBe(true);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "GET /api/settings/ai returns saved config",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as AiSettings;
      expect(body.provider).toBe("anthropic");
      expect(body.hasApiKey).toBe(true);
      expect(body.autoSummarize).toBe(true);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/settings/ai rejects invalid provider",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "invalid-provider" }),
      });
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid provider");
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/settings/ai allows partial update",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoSummarize: false }),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as AiSettings;
      // Provider should still be anthropic (not cleared)
      expect(body.provider).toBe("anthropic");
      expect(body.autoSummarize).toBe(false);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/settings/ai can clear config",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "",
          apiKey: "",
          model: "",
          autoSummarize: false,
          baseURL: "",
          sdkType: "",
        }),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as AiSettings;
      expect(body.provider).toBe("");
      expect(body.hasApiKey).toBe(false);
      expect(body.autoSummarize).toBe(false);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/settings/ai accepts custom provider with baseURL and sdkType",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "custom",
          apiKey: "sk-custom-1234567890",
          model: "my-model-v1",
          baseURL: "https://my-api.example.com/v1",
          sdkType: "openai",
        }),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as AiSettings;
      expect(body.provider).toBe("custom");
      expect(body.hasApiKey).toBe(true);
      expect(body.model).toBe("my-model-v1");
      expect(body.baseURL).toBe("https://my-api.example.com/v1");
      expect(body.sdkType).toBe("openai");
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "GET /api/settings/ai returns custom provider fields",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as AiSettings;
      expect(body.provider).toBe("custom");
      expect(body.baseURL).toBe("https://my-api.example.com/v1");
      expect(body.sdkType).toBe("openai");
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/settings/ai rejects invalid sdkType",
    async () => {
      const res = await fetch(`${BASE_URL}/api/settings/ai`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdkType: "invalid-sdk" }),
      });
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid SDK type");
    },
  );
});

// ---------------------------------------------------------------------------
// AI Settings page
// ---------------------------------------------------------------------------

describe("AI Settings page", () => {
  test.skipIf(!SHOULD_RUN)(
    "GET /settings/ai returns 200",
    async () => {
      const res = await fetch(`${BASE_URL}/settings/ai`);
      expect(res.status).toBe(200);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "contains AI Settings heading",
    async () => {
      const res = await fetch(`${BASE_URL}/settings/ai`);
      const html = await res.text();
      expect(html).toContain("AI Settings");
    },
  );
});
