// E2E: Daily Review API round-trip.
//
// Runs against the dev:e2e server (port 17018, E2E_SKIP_AUTH=true).
// Tests the GET /api/daily/:date and POST /api/daily/:date/analyze endpoints.
//
// IMPORTANT: Skipped unless RUN_E2E=true.

import { type Subprocess, spawn } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Skip guard
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
    cwd: new URL("../../..", import.meta.url).pathname.replace(/\/$/, ""),
    stdout: "ignore",
    stderr: "ignore",
  });

  await waitForServer(`${BASE_URL}/api/live`, STARTUP_TIMEOUT_MS);
  console.log("[E2E] Server ready");
});

afterAll(async () => {
  if (server) {
    server.kill();
    server = null;
    console.log("[E2E] Server stopped");
  }
});

// ---------------------------------------------------------------------------
// Seed sessions for 2026-02-27 so daily stats & analyze endpoints have data
// ---------------------------------------------------------------------------

// 2026-02-27T00:00:00+08:00 in epoch seconds
const SEED_DATE_EPOCH_START = 1772121600;

beforeAll(async () => {
  if (!SHOULD_RUN) return;

  await fetch(`${BASE_URL}/api/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessions: [
        {
          id: crypto.randomUUID(),
          app_name: "VS Code",
          bundle_id: "com.microsoft.VSCode",
          window_title: "daily-review.test.ts",
          url: null,
          start_time: SEED_DATE_EPOCH_START + 3600 * 2, // 02:00 UTC = 10:00 CST
          duration: 3600,
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
          window_title: "GitHub PR Review",
          url: "https://github.com/example/pr/1",
          start_time: SEED_DATE_EPOCH_START + 3600 * 6, // 06:00 UTC = 14:00 CST
          duration: 1800,
          tab_title: "PR #1",
          tab_count: 3,
          document_path: null,
          is_full_screen: false,
          is_minimized: false,
        },
        {
          id: crypto.randomUUID(),
          app_name: "Terminal",
          bundle_id: "com.apple.Terminal",
          window_title: "zsh — bun test",
          url: null,
          start_time: SEED_DATE_EPOCH_START + 3600 * 8, // 08:00 UTC = 16:00 CST
          duration: 900,
          tab_title: null,
          tab_count: null,
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

// ---------------------------------------------------------------------------
// GET /api/daily/:date — validation
// ---------------------------------------------------------------------------

describe("GET /api/daily/:date — validation", () => {
  test.skipIf(!SHOULD_RUN)("rejects invalid date format", async () => {
    const res = await fetch(`${BASE_URL}/api/daily/not-a-date`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid date format");
  });

  test.skipIf(!SHOULD_RUN)("allows today's date", async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const res = await fetch(`${BASE_URL}/api/daily/${todayStr}`);
    // Should succeed (200) — today is now allowed
    expect(res.status).toBe(200);
  });

  test.skipIf(!SHOULD_RUN)("rejects future date", async () => {
    const res = await fetch(`${BASE_URL}/api/daily/2099-12-31`);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/daily/:date — data retrieval
// ---------------------------------------------------------------------------

describe("GET /api/daily/:date — data", () => {
  test.skipIf(!SHOULD_RUN)("returns stats and null AI for a valid past date", async () => {
    const res = await fetch(`${BASE_URL}/api/daily/2026-02-27`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      stats: { date: string; totalSessions: number; scores: { overall: number } };
      ai: null | object;
    };

    expect(body.stats).toBeDefined();
    expect(body.stats.date).toBe("2026-02-27");
    expect(typeof body.stats.totalSessions).toBe("number");
    expect(typeof body.stats.scores.overall).toBe("number");
    // AI may or may not be populated depending on prior runs
  });

  test.skipIf(!SHOULD_RUN)("returns consistent data on repeated requests (cache hit)", async () => {
    const res1 = await fetch(`${BASE_URL}/api/daily/2026-02-26`);
    const body1 = await res1.json();

    const res2 = await fetch(`${BASE_URL}/api/daily/2026-02-26`);
    const body2 = await res2.json();

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Stats should be identical
    expect(JSON.stringify(body1.stats)).toBe(JSON.stringify(body2.stats));
  });
});

// ---------------------------------------------------------------------------
// POST /api/daily/:date/analyze — validation
// ---------------------------------------------------------------------------

describe("POST /api/daily/:date/analyze — validation", () => {
  test.skipIf(!SHOULD_RUN)("rejects invalid date format", async () => {
    const res = await fetch(`${BASE_URL}/api/daily/bad/analyze`, {
      method: "POST",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid date format");
  });

  test.skipIf(!SHOULD_RUN)("allows today's date for analysis", async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const res = await fetch(`${BASE_URL}/api/daily/${todayStr}/analyze`, {
      method: "POST",
    });
    // Should not be 400 for "future dates" — it's allowed now.
    // May be 400 for "no sessions" or "AI not configured", but not for date validation.
    if (res.status === 400) {
      const body = (await res.json()) as { error: string };
      expect(body.error).not.toContain("Cannot analyze future dates");
    }
  });

  test.skipIf(!SHOULD_RUN)("returns 400 when stats not yet computed", async () => {
    // Use a date far in the past that likely has no data cached
    const res = await fetch(`${BASE_URL}/api/daily/2020-01-01/analyze`, {
      method: "POST",
    });
    // Should be 400 because no stats have been cached for this date
    // (GET /api/daily/2020-01-01 must be called first)
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/daily/:date/analyze — real LLM integration
// ---------------------------------------------------------------------------

const AI_AUTH_TOKEN = process.env.AI_E2E_AUTH_TOKEN ?? "";
const AI_BASE_URL = process.env.AI_E2E_BASE_URL ?? "";
const AI_MODEL = process.env.AI_E2E_MODEL ?? "";
const HAS_AI_CREDS = !!(AI_AUTH_TOKEN && AI_BASE_URL && AI_MODEL);

describe("POST /api/daily/:date/analyze — AI integration", () => {
  // Pre-requisite: configure AI settings and ensure stats exist
  test.skipIf(!SHOULD_RUN || !HAS_AI_CREDS)("configure AI settings for analysis", async () => {
    const res = await fetch(`${BASE_URL}/api/settings/ai`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "custom",
        apiKey: AI_AUTH_TOKEN,
        model: AI_MODEL,
        baseURL: AI_BASE_URL,
        sdkType: "anthropic",
      }),
    });
    expect(res.status).toBe(200);
  });

  test.skipIf(!SHOULD_RUN || !HAS_AI_CREDS)("ensure stats exist for analysis date", async () => {
    // Call GET first to populate stats cache
    const res = await fetch(`${BASE_URL}/api/daily/2026-02-27`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      stats: { totalSessions: number };
    };
    expect(body.stats.totalSessions).toBeGreaterThan(0);
  });

  test.skipIf(!SHOULD_RUN || !HAS_AI_CREDS)("generates AI analysis with real LLM", async () => {
    const res = await fetch(`${BASE_URL}/api/daily/2026-02-27/analyze`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      score: number;
      result: {
        score: number;
        highlights: string[];
        improvements: string[];
        summary: string;
      };
      model: string;
      generatedAt: string;
      cached: boolean;
    };

    expect(body.score).toBeGreaterThanOrEqual(1);
    expect(body.score).toBeLessThanOrEqual(100);
    expect(body.result.highlights.length).toBeGreaterThan(0);
    expect(body.result.improvements.length).toBeGreaterThan(0);
    expect(body.result.summary.length).toBeGreaterThan(0);
    expect(body.model).toBe(AI_MODEL);
    // Note: cached may be true if a prior test run already analysed this date
    // (D1 database persists between runs). We only assert structure here.
    expect(typeof body.cached).toBe("boolean");

    console.log(`[E2E] AI analysis score: ${body.score}`);
    console.log(`[E2E] AI highlights: ${body.result.highlights.join("; ")}`);
  });

  test.skipIf(!SHOULD_RUN || !HAS_AI_CREDS)("returns cached result on second request", async () => {
    const res = await fetch(`${BASE_URL}/api/daily/2026-02-27/analyze`, {
      method: "POST",
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { cached: boolean; score: number };
    expect(body.cached).toBe(true);
    expect(body.score).toBeGreaterThanOrEqual(1);
  });
});
