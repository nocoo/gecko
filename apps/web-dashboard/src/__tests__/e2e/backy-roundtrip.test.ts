// E2E: Backy backup round-trip — configure, push, pull, and verify.
//
// Runs against the dev:e2e server (port 17018, E2E_SKIP_AUTH=true).
// Spawns a mock Backy server to receive uploads and verify payloads.
//
// IMPORTANT: Skipped unless explicitly invoked via `bun run test:e2e`.
// Set RUN_E2E=true to run these in the general test suite.

import { gunzipSync } from "node:zlib";
import { type Server, type Subprocess, serve, spawn } from "bun";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { BackupEnvelope } from "@/lib/backy";

// ---------------------------------------------------------------------------
// Skip guard
// ---------------------------------------------------------------------------

const SHOULD_RUN = process.env.RUN_E2E === "true";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = "http://localhost:17018";
const MOCK_BACKY_PORT = 10799;
const MOCK_BACKY_URL = `http://localhost:${MOCK_BACKY_PORT}/webhook/gecko`;
const MOCK_BACKY_API_KEY = "test-backy-api-key-12345";
const STARTUP_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// App server lifecycle
// ---------------------------------------------------------------------------

let appServer: Subprocess | null = null;

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

// ---------------------------------------------------------------------------
// Mock Backy server — receives uploads and stores them for assertion
// ---------------------------------------------------------------------------

interface ReceivedBackup {
  authorization: string | null;
  tag: string | null;
  environment: string | null;
  fileName: string;
  compressed: Buffer;
  envelope: BackupEnvelope;
}

let mockBacky: Server<unknown> | null = null;
const receivedBackups: ReceivedBackup[] = [];

function startMockBacky() {
  mockBacky = serve({
    port: MOCK_BACKY_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // HEAD — connection test
      if (req.method === "HEAD") {
        const auth = req.headers.get("Authorization");
        if (auth !== `Bearer ${MOCK_BACKY_API_KEY}`) {
          return new Response(null, { status: 401 });
        }
        return new Response(null, { status: 200 });
      }

      // GET — backup history
      if (req.method === "GET" && url.pathname.includes("/webhook/")) {
        return Response.json({
          project_name: "gecko",
          total_backups: receivedBackups.length,
          recent_backups: receivedBackups.map((b) => ({
            tag: b.tag,
            file_name: b.fileName,
            created_at: new Date().toISOString(),
          })),
        });
      }

      // POST — receive backup
      if (req.method === "POST") {
        const auth = req.headers.get("Authorization");
        if (auth !== `Bearer ${MOCK_BACKY_API_KEY}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File;
        const tag = formData.get("tag") as string;
        const environment = formData.get("environment") as string;

        const arrayBuf = await file.arrayBuffer();
        const compressed = Buffer.from(arrayBuf);
        const decompressed = gunzipSync(compressed);
        const envelope = JSON.parse(decompressed.toString()) as BackupEnvelope;

        receivedBackups.push({
          authorization: auth,
          tag,
          environment,
          fileName: file.name,
          compressed,
          envelope,
        });

        return Response.json({ ok: true, id: crypto.randomUUID() });
      }

      return new Response("Not Found", { status: 404 });
    },
  });
}

// ---------------------------------------------------------------------------
// Setup & teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  if (!SHOULD_RUN) return;

  // Start mock backy server
  startMockBacky();
  console.log(`[E2E] Mock Backy server started on port ${MOCK_BACKY_PORT}`);

  // Start or detect app server
  try {
    const res = await fetch(`${BASE_URL}/api/sessions`);
    if (res.status > 0) {
      console.log("[E2E] App server already running on port 17018");
      return;
    }
  } catch {
    // Not running — start it
  }

  console.log("[E2E] Starting dev:e2e server...");
  appServer = spawn({
    cmd: ["bun", "run", "dev:e2e"],
    cwd: `${import.meta.dir}/../..`,
    stdout: "ignore",
    stderr: "ignore",
  });

  await waitForServer(`${BASE_URL}/api/sessions`, STARTUP_TIMEOUT_MS);
  console.log("[E2E] App server ready.");
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  if (appServer) {
    console.log("[E2E] Shutting down app server...");
    appServer.kill();
    appServer = null;
  }
  if (mockBacky) {
    console.log("[E2E] Shutting down mock Backy server...");
    mockBacky.stop();
    mockBacky = null;
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function api(path: string, opts?: RequestInit) {
  return fetch(`${BASE_URL}${path}`, opts);
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe.skipIf(!SHOULD_RUN)("E2E: Backy backup round-trip", () => {
  // -------------------------------------------------------------------------
  // Scenario 1: Configure push, test connection, execute push
  // -------------------------------------------------------------------------

  describe("Scenario: Push backup to Backy", () => {
    test("GIVEN fresh state, GET /api/backy/config returns valid response", async () => {
      const res = await api("/api/backy/config");
      expect(res.status).toBe(200);
      const data = await res.json();
      // May or may not be configured from prior run — just validate shape
      expect(typeof data.configured).toBe("boolean");
    });

    test("WHEN I save push config, THEN it persists", async () => {
      const res = await api("/api/backy/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          webhookUrl: MOCK_BACKY_URL,
          apiKey: MOCK_BACKY_API_KEY,
        }),
      });
      expect(res.status).toBe(200);

      // Verify it's saved
      const getRes = await api("/api/backy/config");
      const config = await getRes.json();
      expect(config.configured).toBe(true);
      expect(config.webhookUrl).toBe(MOCK_BACKY_URL);
      // API key should be masked
      expect(config.apiKey).toContain("•");
      expect(config.apiKey).toMatch(/2345$/);
    });

    test("WHEN I test connection, THEN mock Backy responds 200", async () => {
      const res = await api("/api/backy/test", { method: "POST" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.status).toBe(200);
      expect(data.durationMs).toBeGreaterThanOrEqual(0);
    });

    test("WHEN I push backup, THEN mock Backy receives valid gzipped envelope", async () => {
      const beforeCount = receivedBackups.length;

      const res = await api("/api/backy/push", { method: "POST" });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.tag).toMatch(/^v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}/);
      expect(data.fileName).toMatch(/\.json\.gz$/);
      expect(data.stats).toBeDefined();
      expect(data.compressedBytes).toBeGreaterThan(0);

      // Verify mock Backy received the upload
      expect(receivedBackups.length).toBe(beforeCount + 1);
      const received = receivedBackups[receivedBackups.length - 1];
      if (!received) return;
      expect(received.authorization).toBe(`Bearer ${MOCK_BACKY_API_KEY}`);
      expect(received.envelope.schemaVersion).toBe(1);
      expect(received.envelope.exportedAt).toBeTruthy();
      // Backy settings should be excluded
      const backySettings = received.envelope.settings.filter((s) => s.key.startsWith("backy."));
      expect(backySettings).toHaveLength(0);
    });

    test("WHEN I GET /api/backy/history, THEN it returns history from mock Backy", async () => {
      const res = await api("/api/backy/history");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.project_name).toBe("gecko");
      expect(data.total_backups).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: Pull key management and pull webhook
  // -------------------------------------------------------------------------

  describe("Scenario: Pull webhook — Backy triggers backup", () => {
    let pullKey: string;

    test("GIVEN no pull key, GET /api/backy/pull-key returns exists:false", async () => {
      const res = await api("/api/backy/pull-key");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.exists).toBe(false);
    });

    test("WHEN I generate a pull key, THEN I get a bpk_ prefixed key", async () => {
      const res = await api("/api/backy/pull-key", { method: "POST" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.key).toMatch(/^bpk_[0-9a-f]{64}$/);
      pullKey = data.key;

      // Verify it exists now
      const getRes = await api("/api/backy/pull-key");
      const status = await getRes.json();
      expect(status.exists).toBe(true);
      expect(status.maskedKey).toMatch(/^bpk_/);
      expect(status.maskedKey).toContain("•");
    });

    test("WHEN Backy calls HEAD /api/backy/pull with valid key, THEN 200", async () => {
      const res = await api("/api/backy/pull", {
        method: "HEAD",
        headers: { "X-Webhook-Key": pullKey },
      });
      expect(res.status).toBe(200);
    });

    test("WHEN Backy calls HEAD /api/backy/pull with invalid key, THEN 401", async () => {
      const res = await api("/api/backy/pull", {
        method: "HEAD",
        headers: { "X-Webhook-Key": "bpk_invalid" },
      });
      expect(res.status).toBe(401);
    });

    test("WHEN Backy calls POST /api/backy/pull, THEN it triggers a push to mock Backy", async () => {
      const beforeCount = receivedBackups.length;

      const res = await api("/api/backy/pull", {
        method: "POST",
        headers: { "X-Webhook-Key": pullKey },
      });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.tag).toBeTruthy();
      expect(data.fileName).toBeTruthy();
      expect(data.stats).toBeDefined();

      // Mock Backy should have received another backup
      expect(receivedBackups.length).toBe(beforeCount + 1);
    });

    test("WHEN I revoke the pull key, THEN HEAD returns 401", async () => {
      const res = await api("/api/backy/pull-key", { method: "DELETE" });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.revoked).toBe(true);

      // Verify pull endpoint no longer works
      const headRes = await api("/api/backy/pull", {
        method: "HEAD",
        headers: { "X-Webhook-Key": pullKey },
      });
      expect(headRes.status).toBe(401);
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Error cases
  // -------------------------------------------------------------------------

  describe("Scenario: Error handling", () => {
    test("POST /api/backy/pull without X-Webhook-Key returns 401", async () => {
      const res = await api("/api/backy/pull", { method: "POST" });
      expect(res.status).toBe(401);
    });

    test("PUT /api/backy/config with invalid URL returns 400", async () => {
      const res = await api("/api/backy/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl: "not-a-url", apiKey: "key" }),
      });
      expect(res.status).toBe(400);
    });

    test("PUT /api/backy/config with missing fields returns 400", async () => {
      const res = await api("/api/backy/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(400);
    });
  });
});
