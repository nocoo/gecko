/**
 * Tests for backy-push.ts (core push logic) and
 * /api/backy/push + /api/backy/history route handlers.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { gunzipSync } from "node:zlib";
import { executePush } from "@/lib/backy-push";
import type { BackupEnvelope } from "@/lib/backy";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.E2E_SKIP_AUTH = "true";
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

/**
 * Mock fetch that routes D1 calls vs external (backy) calls.
 * Captures the FormData sent to the backy webhook for assertion.
 */
function mockFetchRouter(opts: {
  d1Handler?: (sql: string, params: unknown[]) => unknown[];
  backyStatus?: number;
  backyBody?: string;
  backyHandler?: (url: string, init: RequestInit) => Response;
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

    if (opts.backyHandler) {
      return opts.backyHandler(urlStr, init!);
    }
    return new Response(opts.backyBody ?? "OK", { status: opts.backyStatus ?? 200 });
  }) as unknown as typeof fetch;

  return { d1Calls, backyCalls };
}

// ---------------------------------------------------------------------------
// executePush — core logic
// ---------------------------------------------------------------------------

describe("executePush", () => {
  test("returns error when push config not found", async () => {
    mockFetchRouter({});
    const result = await executePush("u1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("not configured");
      expect(result.status).toBe(422);
    }
  });

  test("executes full push flow with provided config", async () => {
    const { backyCalls } = mockFetchRouter({ backyStatus: 200 });

    const result = await executePush("u1", {
      webhookUrl: "https://backy.test/webhook",
      apiKey: "sk-test",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.tag).toMatch(/^v\d+\.\d+\.\d+-\d{4}-\d{2}-\d{2}-\d+sess-\d+cat-\d+tag$/);
      expect(result.fileName).toMatch(/^gecko-backup-\d{4}-\d{2}-\d{2}\.json\.gz$/);
      expect(result.stats).toBeDefined();
      expect(result.compressedBytes).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    }

    // Verify the backy webhook was called with POST + FormData
    expect(backyCalls).toHaveLength(1);
    const bc0 = backyCalls[0];
    if (!bc0) return;
    expect(bc0.method).toBe("POST");
    expect(bc0.url).toBe("https://backy.test/webhook");
    expect(bc0.body).toBeInstanceOf(FormData);
  });

  test("sends valid gzipped BackupEnvelope in FormData", async () => {
    const { backyCalls } = mockFetchRouter({
      d1Handler: (sql) => {
        if (sql.includes("focus_sessions")) {
          return [{
            id: "s1", user_id: "u1", device_id: "d1", app_name: "Chrome",
            window_title: "Test", url: null, start_time: 100, end_time: null,
            duration: 60, bundle_id: null, tab_title: null, tab_count: null,
            document_path: null, is_full_screen: 0, is_minimized: 0, synced_at: null,
          }];
        }
        return [];
      },
    });

    const result = await executePush("u1", {
      webhookUrl: "https://backy.test/webhook",
      apiKey: "sk-test",
    });

    expect(result.ok).toBe(true);

    // Extract and decompress the file from FormData
    const bc0 = backyCalls[0];
    if (!bc0) return;
    const formData = bc0.body!;
    const file = formData.get("file") as Blob;
    expect(file).toBeTruthy();

    const arrayBuf = await file.arrayBuffer();
    const decompressed = gunzipSync(Buffer.from(arrayBuf));
    const envelope = JSON.parse(decompressed.toString()) as BackupEnvelope;

    expect(envelope.schemaVersion).toBe(1);
    expect(envelope.userId).toBe("u1");
    expect(envelope.focusSessions).toHaveLength(1);
    const fs0 = envelope.focusSessions[0];
    if (!fs0) return;
    expect(fs0.app_name).toBe("Chrome");

    // Check FormData fields
    expect(formData.get("environment")).toBeTruthy();
    expect(formData.get("tag")).toMatch(/^v\d/);
  });

  test("returns error when backy responds with non-200", async () => {
    mockFetchRouter({ backyStatus: 500, backyBody: "Internal Server Error" });

    const result = await executePush("u1", {
      webhookUrl: "https://backy.test/webhook",
      apiKey: "sk-test",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("500");
      expect(result.status).toBe(502);
    }
  });

  test("returns error when fetch throws", async () => {
    mockFetchRouter({
      backyHandler: () => { throw new Error("Network error"); },
    });

    const result = await executePush("u1", {
      webhookUrl: "https://backy.test/webhook",
      apiKey: "sk-test",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Network error");
      expect(result.status).toBe(502);
    }
  });

  test("filters out backy.* settings from envelope", async () => {
    const { backyCalls } = mockFetchRouter({
      d1Handler: (sql) => {
        if (sql.includes("FROM settings")) {
          return [
            { user_id: "u1", key: "timezone", value: "UTC", updated_at: 1000 },
            { user_id: "u1", key: "backy.webhookUrl", value: "https://secret", updated_at: 2000 },
            { user_id: "u1", key: "backy.apiKey", value: "sk-secret", updated_at: 2000 },
          ];
        }
        return [];
      },
    });

    await executePush("u1", {
      webhookUrl: "https://backy.test/webhook",
      apiKey: "sk-test",
    });

    const bc0 = backyCalls[0];
    if (!bc0 || !bc0.body) return;
    const file = bc0.body.get("file") as Blob;
    const buf = Buffer.from(await file.arrayBuffer());
    const envelope = JSON.parse(gunzipSync(buf).toString()) as BackupEnvelope;

    expect(envelope.settings).toHaveLength(1);
    const s0 = envelope.settings[0];
    if (!s0) return;
    expect(s0.key).toBe("timezone");
  });
});

// ---------------------------------------------------------------------------
// /api/backy/push route
// ---------------------------------------------------------------------------

describe("/api/backy/push POST", () => {
  test("returns push result on success", async () => {
    mockFetchRouter({
      d1Handler: (sql) => {
        if (sql.includes("backy.webhookUrl")) {
          return [
            { key: "backy.webhookUrl", value: "https://backy.test/webhook" },
            { key: "backy.apiKey", value: "sk-test" },
          ];
        }
        return [];
      },
      backyStatus: 200,
    });

    const { POST } = await import("../../app/api/backy/push/route");
    const res = await POST();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.tag).toBeTruthy();
    expect(data.fileName).toBeTruthy();
    expect(data.stats).toBeDefined();
  });

  test("returns 422 when not configured", async () => {
    mockFetchRouter({});
    const { POST } = await import("../../app/api/backy/push/route");
    const res = await POST();
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// /api/backy/history route
// ---------------------------------------------------------------------------

describe("/api/backy/history GET", () => {
  test("returns history from backy service", async () => {
    const history = { project_name: "gecko", total_backups: 5, recent_backups: [] };
    mockFetchRouter({
      d1Handler: (sql) => {
        if (sql.includes("backy.webhookUrl")) {
          return [
            { key: "backy.webhookUrl", value: "https://backy.test/webhook" },
            { key: "backy.apiKey", value: "sk-test" },
          ];
        }
        return [];
      },
      backyHandler: (_url, init) => {
        if (init.method === "GET") {
          return new Response(JSON.stringify(history), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("OK", { status: 200 });
      },
    });

    const { GET } = await import("../../app/api/backy/history/route");
    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.project_name).toBe("gecko");
    expect(data.total_backups).toBe(5);
  });

  test("returns 422 when not configured", async () => {
    mockFetchRouter({});
    const { GET } = await import("../../app/api/backy/history/route");
    const res = await GET();
    expect(res.status).toBe(422);
  });

  test("returns 502 when backy fetch fails", async () => {
    mockFetchRouter({
      d1Handler: (sql) => {
        if (sql.includes("backy.webhookUrl")) {
          return [
            { key: "backy.webhookUrl", value: "https://backy.test/webhook" },
            { key: "backy.apiKey", value: "sk-test" },
          ];
        }
        return [];
      },
      backyHandler: () => { throw new Error("timeout"); },
    });

    const { GET } = await import("../../app/api/backy/history/route");
    const res = await GET();
    expect(res.status).toBe(502);
  });
});
