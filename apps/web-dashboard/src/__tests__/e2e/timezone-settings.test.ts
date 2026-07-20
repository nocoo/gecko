// L2 (6DQ Integration/API E2E) — real HTTP on :17018; run via `bun run test:e2e` / root `test:l2`.
// E2E: Timezone Settings API round-trip.
//
// Runs against the dev:e2e server (port 17018, E2E_SKIP_AUTH=true).
// Spawns the server, waits for readiness, runs BDD-style scenarios, then shuts down.
//
// IMPORTANT: Skipped unless explicitly invoked via `bun run test:e2e`.
// Set RUN_E2E=true to run these in the general test suite.

import { type Subprocess, spawn } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Skip guard — only run when explicitly requested
// ---------------------------------------------------------------------------

const SHOULD_RUN = process.env.RUN_E2E === "true";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost:17018";
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
    const res = await fetch(`${BASE_URL}/api/live`);
    if (res.status > 0) {
      console.log("[E2E] Server already running on port 17018");
      return;
    }
  } catch {
    // Not running — start it
  }

  console.log("[E2E] Starting dev:e2e server...");
  server = spawn({
    cmd: ["bun", "run", "dev:e2e"],
    cwd: `${import.meta.dir}/../..`,
    stdout: "ignore",
    stderr: "ignore",
  });

  await waitForServer(`${BASE_URL}/api/live`, STARTUP_TIMEOUT_MS);
  console.log("[E2E] Server ready.");
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  if (server) {
    console.log("[E2E] Shutting down server...");
    server.kill();
    server = null;
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const api = (path: string, init?: RequestInit) => fetch(`${BASE_URL}${path}`, init);

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe("E2E: Timezone Settings API", () => {
  test.skipIf(!SHOULD_RUN)("GET /api/settings/timezone returns default timezone", async () => {
    const res = await api("/api/settings/timezone");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(typeof body.timezone).toBe("string");
    expect(body.timezone.length).toBeGreaterThan(0);
  });

  test.skipIf(!SHOULD_RUN)("PUT /api/settings/timezone updates timezone", async () => {
    const res = await api("/api/settings/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: "America/New_York" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.timezone).toBe("America/New_York");
  });

  test.skipIf(!SHOULD_RUN)("GET /api/settings/timezone reads back updated timezone", async () => {
    const res = await api("/api/settings/timezone");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.timezone).toBe("America/New_York");
  });

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/settings/timezone with invalid timezone returns 400",
    async () => {
      const res = await api("/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: "Not/A/Zone" }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBeDefined();
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/settings/timezone with missing timezone returns 400",
    async () => {
      const res = await api("/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toBeDefined();
    },
  );

  test.skipIf(!SHOULD_RUN)("PUT /api/settings/timezone restores original timezone", async () => {
    const res = await api("/api/settings/timezone", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: "Asia/Shanghai" }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.timezone).toBe("Asia/Shanghai");
  });
});
