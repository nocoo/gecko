// E2E: Public API — test /api/v1/snapshot with API key authentication.
//
// Runs against the dev:e2e server (port 17018, E2E_SKIP_AUTH=true).
// IMPORTANT: Skipped unless RUN_E2E=true.

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
    } catch {}
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
  } catch {}

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
    server.kill();
    server = null;
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const api = (path: string, init?: RequestInit) =>
  fetch(`${BASE_URL}${path}`, init);

const authHeaders = { Authorization: "Bearer gk_test_e2e_key" };

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe("E2E: GET /api/v1/snapshot", () => {
  const todayStr = new Date().toISOString().slice(0, 10);

  // -------------------------------------------------------------------------
  // Scenario 1: Seed data via /api/sync so snapshot has something to return
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "First sync some sessions so snapshot has data",
    async () => {
      const now = Math.floor(Date.now() / 1000);
      const res = await api("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessions: [
            {
              id: crypto.randomUUID(),
              app_name: "Safari",
              bundle_id: "com.apple.Safari",
              start_time: now - 300,
              duration: 300,
              url: "https://example.com",
              window_title: "Example",
            },
          ],
        }),
      });

      expect(res.status).toBe(202);
      const body = await res.json();
      expect(body.accepted).toBe(1);

      // Wait for async queue drain (interval is 2s, give it 4s)
      await new Promise((r) => setTimeout(r, 4000));
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 2: Successful snapshot for today
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "returns snapshot for today",
    async () => {
      const res = await api(`/api/v1/snapshot?date=${todayStr}`, {
        headers: authHeaders,
      });

      expect(res.status).toBe(200);

      const body = (await res.json()) as {
        date: string;
        timezone: string;
        stats: {
          totalSessions: number;
          totalDuration: number;
          topApps: unknown[];
        };
        ai: null | object;
      };

      expect(body.date).toBe(todayStr);
      expect(body.timezone).toBeDefined();
      expect(body.stats).toBeDefined();
      expect(typeof body.stats.totalSessions).toBe("number");
      expect(typeof body.stats.totalDuration).toBe("number");
      expect(Array.isArray(body.stats.topApps)).toBe(true);
      // AI may or may not be populated
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 3: Missing date param → 400
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "returns 400 for missing date param",
    async () => {
      const res = await api("/api/v1/snapshot", {
        headers: authHeaders,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBeDefined();
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 4: Invalid date format → 400
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "returns 400 for invalid date format",
    async () => {
      const res = await api("/api/v1/snapshot?date=not-a-date", {
        headers: authHeaders,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBeDefined();
    },
  );

  // -------------------------------------------------------------------------
  // Scenario 5: Future date → 400
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "returns 400 for future date",
    async () => {
      const res = await api("/api/v1/snapshot?date=2099-01-01", {
        headers: authHeaders,
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBeDefined();
    },
  );
});
