// E2E: API Keys round-trip — create, list, rename, revoke API keys.
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
      if (res.status > 0) return; // any response means server is up
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

const json = (path: string, init?: RequestInit) =>
  api(path, init).then((r) => r.json());

// ---------------------------------------------------------------------------
// Shared state across ordered test scenarios
// ---------------------------------------------------------------------------

let createdKeyId = "";

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe.skipIf(!SHOULD_RUN)("E2E: API Keys round-trip", () => {
  // -------------------------------------------------------------------------
  // Scenario 1: POST /api/keys creates a key and returns key material
  // -------------------------------------------------------------------------

  describe("Scenario: Create a new API key", () => {
    test("POST /api/keys returns 201 with all required fields", async () => {
      const res = await api("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "E2E Test Device" }),
      });

      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.id).toBeDefined();
      expect(body.key).toBeDefined();
      expect(body.deviceId).toBeDefined();
      expect(body.name).toBe("E2E Test Device");
      expect(body.createdAt).toBeDefined();

      // Key material must start with the "gk_" prefix
      expect(body.key).toStartWith("gk_");

      // Stash the ID for subsequent tests
      createdKeyId = body.id;
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: POST /api/keys with missing name returns 400
  // -------------------------------------------------------------------------

  describe("Scenario: Validation rejects missing name", () => {
    test("POST /api/keys without name returns 400", async () => {
      const res = await api("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain("name");
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: GET /api/keys lists the created key
  // -------------------------------------------------------------------------

  describe("Scenario: List API keys includes the newly created key", () => {
    test("GET /api/keys contains the key we just created", async () => {
      const body = await json("/api/keys");

      expect(body.keys).toBeArray();

      const found = body.keys.find(
        (k: { id: string }) => k.id === createdKeyId,
      );
      expect(found).toBeDefined();
      expect(found.name).toBe("E2E Test Device");
      expect(found.deviceId).toBeDefined();
      expect(found.createdAt).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: PATCH /api/keys/[id] renames the key
  // -------------------------------------------------------------------------

  describe("Scenario: Rename an API key", () => {
    test("PATCH /api/keys/[id] returns 200 with updated name", async () => {
      const res = await api(`/api/keys/${createdKeyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed Device" }),
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.id).toBe(createdKeyId);
      expect(body.name).toBe("Renamed Device");
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: PATCH /api/keys/[id] with bad id returns 404
  // -------------------------------------------------------------------------

  describe("Scenario: Rename with non-existent id", () => {
    test("PATCH /api/keys/[bad-id] returns 404", async () => {
      const res = await api("/api/keys/non-existent-id-000", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Ghost Key" }),
      });

      expect(res.status).toBe(404);

      const body = await res.json();
      expect(body.error).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 6: DELETE /api/keys/[id] revokes the key
  // -------------------------------------------------------------------------

  describe("Scenario: Revoke (delete) an API key", () => {
    test("DELETE /api/keys/[id] returns 200 with { deleted: true }", async () => {
      const res = await api(`/api/keys/${createdKeyId}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.deleted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 7: GET /api/keys after delete — key should be gone
  // -------------------------------------------------------------------------

  describe("Scenario: Deleted key no longer appears in list", () => {
    test("GET /api/keys no longer includes the deleted key", async () => {
      const body = await json("/api/keys");

      expect(body.keys).toBeArray();

      const found = body.keys.find(
        (k: { id: string }) => k.id === createdKeyId,
      );
      expect(found).toBeUndefined();
    });
  });
});
