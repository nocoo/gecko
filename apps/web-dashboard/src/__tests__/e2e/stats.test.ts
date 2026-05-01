// E2E: Stats & Timeline API.
//
// Runs against the dev:e2e server (port 17018, E2E_SKIP_AUTH=true).
// Spawns the server, waits for readiness, runs BDD-style scenarios, then shuts down.
//
// IMPORTANT: Skipped unless explicitly invoked via `bun run test:e2e`.
// Set RUN_E2E=true to run these in the general test suite.

import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { spawn, type Subprocess } from "bun";

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
    cwd: import.meta.dir + "/../..",
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

const api = (path: string, init?: RequestInit) =>
  fetch(`${BASE_URL}${path}`, init);

// ---------------------------------------------------------------------------
// Seed data — sync sessions so stats endpoints have something to aggregate
// ---------------------------------------------------------------------------

describe("E2E: Stats API", () => {
  beforeAll(async () => {
    if (!SHOULD_RUN) return;

    const now = Math.floor(Date.now() / 1000);
    await api("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessions: [
          {
            id: crypto.randomUUID(),
            app_name: "VS Code",
            bundle_id: "com.microsoft.VSCode",
            window_title: "main.ts",
            url: null,
            start_time: now - 600,
            duration: 600,
            tab_title: null,
            tab_count: null,
            document_path: null,
            is_full_screen: false,
            is_minimized: false,
          },
          {
            id: crypto.randomUUID(),
            app_name: "Safari",
            bundle_id: "com.apple.Safari",
            window_title: "Example",
            url: "https://example.com",
            start_time: now - 300,
            duration: 300,
            tab_title: "Example",
            tab_count: 1,
            document_path: null,
            is_full_screen: false,
            is_minimized: false,
          },
        ],
      }),
    });

    // Wait for async queue drain (interval is 2s, allow extra margin)
    await new Promise((r) => setTimeout(r, 4000));
  });

  // -------------------------------------------------------------------------
  // /api/stats
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "GET /api/stats returns today's stats",
    async () => {
      const res = await api("/api/stats");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.period).toBe("today");
      expect(typeof body.totalSessions).toBe("number");
      expect(typeof body.totalDuration).toBe("number");
      expect(typeof body.totalApps).toBe("number");
      expect(typeof body.longestSession).toBe("number");
      expect(Array.isArray(body.topApps)).toBe(true);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "GET /api/stats?period=week returns weekly stats",
    async () => {
      const res = await api("/api/stats?period=week");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.period).toBe("week");
      expect(typeof body.totalSessions).toBe("number");
      expect(typeof body.totalDuration).toBe("number");
      expect(Array.isArray(body.topApps)).toBe(true);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "GET /api/stats?period=invalid falls back to today",
    async () => {
      const res = await api("/api/stats?period=invalid");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.period).toBe("today");
    },
  );

  // -------------------------------------------------------------------------
  // /api/stats/timeline
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "GET /api/stats/timeline returns daily timeline",
    async () => {
      const res = await api("/api/stats/timeline");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.period).toBe("week");
      expect(typeof body.timezone).toBe("string");
      expect(Array.isArray(body.timeline)).toBe(true);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "GET /api/stats/timeline?period=month returns monthly timeline",
    async () => {
      const res = await api("/api/stats/timeline?period=month");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.period).toBe("month");
      expect(Array.isArray(body.timeline)).toBe(true);
    },
  );
});
