// E2E: App Notes CRUD — list apps, create/read/update/delete notes.
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
// Seed data — sync sessions so /api/apps has data to list
// ---------------------------------------------------------------------------

describe("E2E: App Notes API", () => {
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
            window_title: "index.ts",
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

    // Wait for async queue drain
    await new Promise((r) => setTimeout(r, 4000));
  });

  // -------------------------------------------------------------------------
  // /api/apps
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "GET /api/apps lists tracked apps",
    async () => {
      const res = await api("/api/apps");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.apps)).toBe(true);
      expect(body.apps.length).toBeGreaterThan(0);

      // Each app should have the expected shape
      const first = body.apps[0];
      expect(typeof first.bundleId).toBe("string");
      expect(typeof first.appName).toBe("string");
      expect(typeof first.totalDuration).toBe("number");
      expect(typeof first.sessionCount).toBe("number");
    },
  );

  // -------------------------------------------------------------------------
  // /api/apps/notes — CRUD
  // -------------------------------------------------------------------------

  test.skipIf(!SHOULD_RUN)(
    "GET /api/apps/notes returns empty notes initially",
    async () => {
      const res = await api("/api/apps/notes");
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(Array.isArray(body.notes)).toBe(true);
      // May or may not be empty depending on prior test runs, but shape is correct
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/apps/notes creates a note",
    async () => {
      const res = await api("/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: "com.apple.Safari",
          note: "Web browsing",
        }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.bundleId).toBe("com.apple.Safari");
      expect(body.note).toBe("Web browsing");
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "GET /api/apps/notes lists the created note",
    async () => {
      const res = await api("/api/apps/notes");
      expect(res.status).toBe(200);

      const body = await res.json();
      const notes = body.notes as Array<{ bundleId: string; note: string }>;
      const safari = notes.find((n) => n.bundleId === "com.apple.Safari");
      expect(safari).toBeDefined();
      expect(safari!.note).toBe("Web browsing");
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/apps/notes updates the note",
    async () => {
      const res = await api("/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: "com.apple.Safari",
          note: "Updated note",
        }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.bundleId).toBe("com.apple.Safari");
      expect(body.note).toBe("Updated note");
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "PUT /api/apps/notes with note > 500 chars returns 400",
    async () => {
      const longNote = "x".repeat(501);
      const res = await api("/api/apps/notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bundleId: "com.apple.Safari",
          note: longNote,
        }),
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("500 characters");
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "DELETE /api/apps/notes removes the note",
    async () => {
      const res = await api("/api/apps/notes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundleId: "com.apple.Safari" }),
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.deleted).toBe(true);
    },
  );

  test.skipIf(!SHOULD_RUN)(
    "GET /api/apps/notes is empty after delete",
    async () => {
      const res = await api("/api/apps/notes");
      expect(res.status).toBe(200);

      const body = await res.json();
      const notes = body.notes as Array<{ bundleId: string }>;
      const safari = notes.find((n) => n.bundleId === "com.apple.Safari");
      expect(safari).toBeUndefined();
    },
  );
});
