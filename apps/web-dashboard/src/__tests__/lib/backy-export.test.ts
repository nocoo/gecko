/**
 * Tests for backy-export.ts — full data export with pagination.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { PAGE_SIZE, exportUserData } from "@/lib/backy-export";
import { BACKUP_SCHEMA_VERSION } from "@/lib/backy";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

/** Build a fake D1 response. */
function d1Response(results: unknown[], meta?: { changes: number }) {
  return {
    success: true,
    result: [{ results, success: true, meta: meta ?? { changes: 0, last_row_id: 0 } }],
    errors: [],
  };
}

/**
 * Mock D1 with a router that inspects the SQL to return appropriate data.
 * Returns the calls array for assertion.
 */
function mockD1Router(handlers: Record<string, (params: unknown[]) => unknown[]>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    // Match handler by checking if the SQL contains the table name
    for (const [pattern, handler] of Object.entries(handlers)) {
      if (body.sql.includes(pattern)) {
        const results = handler(body.params);
        return Promise.resolve(new Response(JSON.stringify(d1Response(results)), { status: 200 }));
      }
    }

    // Default: empty results
    return Promise.resolve(new Response(JSON.stringify(d1Response([])), { status: 200 }));
  }) as unknown as typeof fetch;

  return { calls };
}

// Helper to make a minimal session row
function makeSession(id: string) {
  return {
    id,
    user_id: "u1",
    device_id: "d1",
    app_name: "Chrome",
    window_title: "Test",
    url: null,
    start_time: 1709337600,
    end_time: null,
    duration: 60,
    bundle_id: "com.google.Chrome",
    tab_title: null,
    tab_count: null,
    document_path: null,
    is_full_screen: 0,
    is_minimized: 0,
    synced_at: "2026-03-02T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// exportUserData — basic structure
// ---------------------------------------------------------------------------

describe("exportUserData", () => {
  test("returns a valid BackupEnvelope with empty data", async () => {
    mockD1Router({});

    const env = await exportUserData("u1");

    expect(env.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(env.appVersion).toBeTruthy();
    expect(env.exportedAt).toBeTruthy();
    expect(env.userId).toBe("u1");
    expect(env.focusSessions).toEqual([]);
    expect(env.categories).toEqual([]);
    expect(env.appCategoryMappings).toEqual([]);
    expect(env.tags).toEqual([]);
    expect(env.appTagMappings).toEqual([]);
    expect(env.appNotes).toEqual([]);
    expect(env.dailySummaries).toEqual([]);
    expect(env.settings).toEqual([]);
    expect(env.apiKeys).toEqual([]);
    expect(env.syncLogs).toEqual([]);
  });

  test("collects data from all tables", async () => {
    mockD1Router({
      "focus_sessions": () => [makeSession("s1"), makeSession("s2")],
      "categories": () => [{ id: "c1", user_id: "u1", title: "Dev", icon: "code", is_default: 0, slug: "dev", created_at: "2026-01-01" }],
      "app_category_mappings": () => [{ user_id: "u1", bundle_id: "com.app", category_id: "c1", created_at: "2026-01-01" }],
      "FROM tags": () => [{ id: "t1", user_id: "u1", name: "work", created_at: "2026-01-01" }],
      "app_tag_mappings": () => [{ user_id: "u1", bundle_id: "com.app", tag_id: "t1", created_at: "2026-01-01" }],
      "app_notes": () => [{ user_id: "u1", bundle_id: "com.app", note: "test", created_at: "2026-01-01", updated_at: "2026-01-01" }],
      "daily_summaries": () => [{ id: "ds1", user_id: "u1", date: "2026-03-01", ai_score: 85, ai_result_json: "{}", ai_model: "test", ai_generated_at: "2026-03-01", created_at: "2026-03-01", updated_at: "2026-03-01" }],
      "FROM settings": () => [
        { user_id: "u1", key: "timezone", value: "Asia/Shanghai", updated_at: 1000 },
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 2000 },
        { user_id: "u1", key: "backy.webhookUrl", value: "https://secret", updated_at: 3000 },
        { user_id: "u1", key: "backy.apiKey", value: "sk-secret", updated_at: 3000 },
        { user_id: "u1", key: "backy.pullKey", value: "bpk_secret", updated_at: 3000 },
      ],
      "api_keys": () => [{ id: "ak1", user_id: "u1", name: "Mac", key_hash: "abc", device_id: "d1", created_at: "2026-01-01", last_used: null }],
      "sync_logs": () => [{ id: "sl1", user_id: "u1", device_id: "d1", session_count: 10, first_start: 100, last_start: 200, synced_at: "2026-01-01" }],
    });

    const env = await exportUserData("u1");

    expect(env.focusSessions).toHaveLength(2);
    expect(env.categories).toHaveLength(1);
    expect(env.appCategoryMappings).toHaveLength(1);
    expect(env.tags).toHaveLength(1);
    expect(env.appTagMappings).toHaveLength(1);
    expect(env.appNotes).toHaveLength(1);
    expect(env.dailySummaries).toHaveLength(1);
    expect(env.apiKeys).toHaveLength(1);
    expect(env.syncLogs).toHaveLength(1);
  });

  test("filters out backy.* settings keys", async () => {
    mockD1Router({
      "FROM settings": () => [
        { user_id: "u1", key: "timezone", value: "UTC", updated_at: 1000 },
        { user_id: "u1", key: "backy.webhookUrl", value: "https://secret", updated_at: 2000 },
        { user_id: "u1", key: "backy.apiKey", value: "sk-secret", updated_at: 2000 },
        { user_id: "u1", key: "backy.pullKey", value: "bpk_secret", updated_at: 2000 },
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 3000 },
      ],
    });

    const env = await exportUserData("u1");

    expect(env.settings).toHaveLength(2);
    expect(env.settings.map((s) => s.key).sort()).toEqual(["ai.provider", "timezone"]);
  });
});

// ---------------------------------------------------------------------------
// Pagination for focus_sessions
// ---------------------------------------------------------------------------

describe("exportUserData — session pagination", () => {
  test("fetches single page when sessions < PAGE_SIZE", async () => {
    const sessions = Array.from({ length: 100 }, (_, i) => makeSession(`s-${i}`));
    const { calls } = mockD1Router({
      "focus_sessions": () => sessions,
    });

    const env = await exportUserData("u1");

    expect(env.focusSessions).toHaveLength(100);
    // Only 1 query for sessions (+ other tables in parallel)
    const sessionCalls = calls.filter((c) => c.sql.includes("focus_sessions"));
    expect(sessionCalls).toHaveLength(1);
    const sc0 = sessionCalls[0];
    if (!sc0) return;
    expect(sc0.params).toEqual(["u1", PAGE_SIZE, 0]);
  });

  test("paginates when sessions = PAGE_SIZE (needs second query to confirm end)", async () => {
    const fullPage = Array.from({ length: PAGE_SIZE }, (_, i) => makeSession(`s-${i}`));
    const { calls } = mockD1Router({
      "focus_sessions": (params) => {
        const offset = params[2] as number;
        if (offset === 0) return fullPage;
        return []; // second page is empty
      },
    });

    const env = await exportUserData("u1");

    expect(env.focusSessions).toHaveLength(PAGE_SIZE);
    const sessionCalls = calls.filter((c) => c.sql.includes("focus_sessions"));
    expect(sessionCalls).toHaveLength(2);
    const sc0 = sessionCalls[0];
    const sc1 = sessionCalls[1];
    if (!sc0 || !sc1) return;
    expect(sc0.params).toEqual(["u1", PAGE_SIZE, 0]);
    expect(sc1.params).toEqual(["u1", PAGE_SIZE, PAGE_SIZE]);
  });

  test("paginates across multiple full pages", async () => {
    const makePage = (offset: number, count: number) =>
      Array.from({ length: count }, (_, i) => makeSession(`s-${offset + i}`));

    mockD1Router({
      "focus_sessions": (params) => {
        const offset = params[2] as number;
        if (offset === 0) return makePage(0, PAGE_SIZE);
        if (offset === PAGE_SIZE) return makePage(PAGE_SIZE, PAGE_SIZE);
        if (offset === PAGE_SIZE * 2) return makePage(PAGE_SIZE * 2, 100); // partial last page
        return [];
      },
    });

    const env = await exportUserData("u1");

    expect(env.focusSessions).toHaveLength(PAGE_SIZE * 2 + 100);
    // First session from first page
    const fs0 = env.focusSessions[0];
    if (!fs0) return;
    expect(fs0.id).toBe("s-0");
    // Last session from last page
    const fsLast = env.focusSessions[env.focusSessions.length - 1];
    if (!fsLast) return;
    expect(fsLast.id).toBe(`s-${PAGE_SIZE * 2 + 99}`);
  });
});

// ---------------------------------------------------------------------------
// PAGE_SIZE constant
// ---------------------------------------------------------------------------

describe("PAGE_SIZE", () => {
  test("is 5000", () => {
    expect(PAGE_SIZE).toBe(5000);
  });
});
