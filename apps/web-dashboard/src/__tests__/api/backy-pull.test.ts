/**
 * Tests for /api/backy/pull — Pull webhook endpoint.
 *
 * Tests both HEAD (connection test) and POST (trigger backup) methods.
 * Auth is via X-Webhook-Key header → pull key lookup (no session).
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import type { BackupEnvelope } from "@/lib/backy";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Pull webhook does NOT use E2E_SKIP_AUTH — it has its own auth via X-Webhook-Key
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  delete process.env.E2E_SKIP_AUTH;
  globalThis.fetch = originalFetch;
});

/** D1 response builder */
function d1Resp(results: unknown[]) {
  return JSON.stringify({
    success: true,
    result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
    errors: [],
  });
}

const VALID_PULL_KEY = "bpk_" + "ab".repeat(32);
const USER_ID = "user-abc-123";

/**
 * Mock fetch that routes D1 calls vs external (backy) calls.
 */
function mockFetchRouter(opts: {
  d1Handler?: (sql: string, params: unknown[]) => unknown[];
  backyStatus?: number;
  backyBody?: string;
}) {
  const d1Calls: Array<{ sql: string; params: unknown[] }> = [];
  const backyCalls: Array<{ url: string; method: string; body: FormData | null }> = [];

  globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes("api.cloudflare.com")) {
      const body = JSON.parse((init?.body ?? "") as string);
      d1Calls.push({ sql: body.sql, params: body.params });
      const results = opts.d1Handler?.(body.sql, body.params) ?? [];
      return new Response(d1Resp(results), { status: 200 });
    }

    // Backy calls
    const formData = init?.body instanceof FormData ? init.body : null;
    backyCalls.push({ url: urlStr, method: init?.method ?? "GET", body: formData });
    return new Response(opts.backyBody ?? "OK", { status: opts.backyStatus ?? 200 });
  }) as unknown as typeof fetch;

  return { d1Calls, backyCalls };
}

/** Standard D1 handler that resolves pull key → user and provides push config. */
function standardD1Handler(sql: string, params: unknown[]) {
  // Pull key lookup
  if (sql.includes("backy.pullKey") && sql.includes("SELECT user_id")) {
    if (params.includes(VALID_PULL_KEY)) {
      return [{ user_id: USER_ID }];
    }
    return [];
  }
  // Push config lookup
  if (sql.includes("backy.webhookUrl") && sql.includes("backy.apiKey")) {
    return [
      { key: "backy.webhookUrl", value: "https://backy.test/webhook" },
      { key: "backy.apiKey", value: "sk-test-key" },
    ];
  }
  return [];
}

// ---------------------------------------------------------------------------
// HEAD /api/backy/pull — Connection test
// ---------------------------------------------------------------------------

describe("HEAD /api/backy/pull", () => {
  test("returns 200 for valid pull key", async () => {
    mockFetchRouter({ d1Handler: standardD1Handler });
    const { HEAD } = await import("../../app/api/backy/pull/route");

    const req = new Request("http://localhost/api/backy/pull", {
      method: "HEAD",
      headers: { "X-Webhook-Key": VALID_PULL_KEY },
    });
    const res = await HEAD(req);

    expect(res.status).toBe(200);
  });

  test("returns 401 when X-Webhook-Key header is missing", async () => {
    mockFetchRouter({});
    const { HEAD } = await import("../../app/api/backy/pull/route");

    const req = new Request("http://localhost/api/backy/pull", {
      method: "HEAD",
    });
    const res = await HEAD(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Missing X-Webhook-Key");
  });

  test("returns 401 for invalid pull key", async () => {
    mockFetchRouter({ d1Handler: standardD1Handler });
    const { HEAD } = await import("../../app/api/backy/pull/route");

    const req = new Request("http://localhost/api/backy/pull", {
      method: "HEAD",
      headers: { "X-Webhook-Key": "bpk_invalid" },
    });
    const res = await HEAD(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Invalid webhook key");
  });
});

// ---------------------------------------------------------------------------
// POST /api/backy/pull — Trigger backup
// ---------------------------------------------------------------------------

describe("POST /api/backy/pull", () => {
  test("triggers push and returns result on success", async () => {
    const { backyCalls } = mockFetchRouter({
      d1Handler: standardD1Handler,
      backyStatus: 200,
    });

    const { POST } = await import("../../app/api/backy/pull/route");
    const req = new Request("http://localhost/api/backy/pull", {
      method: "POST",
      headers: { "X-Webhook-Key": VALID_PULL_KEY },
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.tag).toMatch(/^v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}/);
    expect(data.fileName).toMatch(/\.json\.gz$/);
    expect(data.stats).toBeDefined();
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
    expect(data.compressedBytes).toBeGreaterThan(0);

    // Verify the actual push went to the configured backy webhook
    expect(backyCalls).toHaveLength(1);
    const bc0 = backyCalls[0];
    if (!bc0) return;
    expect(bc0.url).toBe("https://backy.test/webhook");
    expect(bc0.method).toBe("POST");
  });

  test("sends valid gzipped envelope to backy service", async () => {
    const { backyCalls } = mockFetchRouter({
      d1Handler: (sql, params) => {
        const standard = standardD1Handler(sql, params);
        if (standard.length > 0) return standard;
        // Add a focus session for richer data
        if (sql.includes("focus_sessions")) {
          return [{
            id: "s1", user_id: USER_ID, device_id: "d1", app_name: "Safari",
            window_title: "Test", url: null, start_time: 100, end_time: 200,
            duration: 100, bundle_id: "com.apple.Safari", tab_title: null,
            tab_count: null, document_path: null, is_full_screen: 0,
            is_minimized: 0, synced_at: null,
          }];
        }
        return [];
      },
      backyStatus: 200,
    });

    const { POST } = await import("../../app/api/backy/pull/route");
    const req = new Request("http://localhost/api/backy/pull", {
      method: "POST",
      headers: { "X-Webhook-Key": VALID_PULL_KEY },
    });
    await POST(req);

    const bc0 = backyCalls[0];
    if (!bc0) return;
    const formData = bc0.body!;
    const file = formData.get("file") as Blob;
    expect(file).toBeTruthy();

    const buf = Buffer.from(await file.arrayBuffer());
    const envelope = JSON.parse(gunzipSync(buf).toString()) as BackupEnvelope;

    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.userId).toBe(USER_ID);
    expect(envelope.focusSessions).toHaveLength(1);
    const fs0 = envelope.focusSessions[0];
    if (!fs0) return;
    expect(fs0.app_name).toBe("Safari");
  });

  test("returns 401 when pull key is missing", async () => {
    mockFetchRouter({});
    const { POST } = await import("../../app/api/backy/pull/route");

    const req = new Request("http://localhost/api/backy/pull", {
      method: "POST",
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  test("returns 401 when pull key is invalid", async () => {
    mockFetchRouter({ d1Handler: standardD1Handler });
    const { POST } = await import("../../app/api/backy/pull/route");

    const req = new Request("http://localhost/api/backy/pull", {
      method: "POST",
      headers: { "X-Webhook-Key": "bpk_wrong-key-here" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  test("returns 422 when user has no push config", async () => {
    // Pull key is valid but no push config (webhookUrl/apiKey)
    mockFetchRouter({
      d1Handler: (sql, params) => {
        if (sql.includes("backy.pullKey") && sql.includes("SELECT user_id")) {
          if (params.includes(VALID_PULL_KEY)) {
            return [{ user_id: USER_ID }];
          }
        }
        // No push config returned
        return [];
      },
    });

    const { POST } = await import("../../app/api/backy/pull/route");
    const req = new Request("http://localhost/api/backy/pull", {
      method: "POST",
      headers: { "X-Webhook-Key": VALID_PULL_KEY },
    });
    const res = await POST(req);

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("not configured");
  });

  test("returns 502 when backy service fails", async () => {
    mockFetchRouter({
      d1Handler: standardD1Handler,
      backyStatus: 500,
      backyBody: "Internal Server Error",
    });

    const { POST } = await import("../../app/api/backy/pull/route");
    const req = new Request("http://localhost/api/backy/pull", {
      method: "POST",
      headers: { "X-Webhook-Key": VALID_PULL_KEY },
    });
    const res = await POST(req);

    // executePush returns { ok: false, status: 502 } on backy error
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.error).toContain("500");
  });
});
