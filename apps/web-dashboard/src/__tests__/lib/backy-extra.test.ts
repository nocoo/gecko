/**
 * Coverage-targeting tests for small helpers/branches that the main
 * test suites don't exercise. Kept separate from the main per-module
 * test files so the intent (close coverage gaps) stays visible.
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildTagFromEnvelope,
  compressEnvelope,
  decompressEnvelope,
  type BackupEnvelope,
} from "@/lib/backy";
import { execute } from "@/lib/d1";

const emptyEnv: BackupEnvelope = {
  schemaVersion: 1,
  appVersion: "0.0.0-test",
  exportedAt: "2026-01-01T00:00:00Z",
  userId: "u-test",
  focusSessions: [],
  categories: [],
  appCategoryMappings: [],
  tags: [],
  appTagMappings: [],
  appNotes: [],
  dailySummaries: [],
  settings: [],
  apiKeys: [],
  syncLogs: [],
};

describe("backy.buildTagFromEnvelope", () => {
  test("returns a non-empty tag derived from envelope stats", () => {
    const tag = buildTagFromEnvelope(emptyEnv);
    expect(typeof tag).toBe("string");
    expect(tag.length).toBeGreaterThan(0);
  });
});

describe("backy.compressEnvelope/decompressEnvelope round-trip", () => {
  test("round-trips through gzip", () => {
    const buf = compressEnvelope(emptyEnv);
    const restored = decompressEnvelope(buf);
    expect(restored.schemaVersion).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// d1 retry-on-network-error branch
// ---------------------------------------------------------------------------

describe("d1.execute retry path", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.CF_ACCOUNT_ID = "a";
    process.env.CF_API_TOKEN = "b";
    process.env.CF_D1_DATABASE_ID = "c";
    delete process.env.CF_D1_DATABASE_ID_TEST;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("retries on `TypeError: fetch failed` then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new TypeError("fetch failed");
      return new Response(
        JSON.stringify({
          success: true,
          result: [{ results: [], success: true, meta: {} }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    const out = await execute("SELECT 1");
    expect(out.results).toEqual([]);
    expect(calls).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// backy-push: covered by the broader push integration; the file itself is a
// thin orchestration wrapper around tested helpers + fetch and is excluded
// from coverage in vitest.config.ts.
// ---------------------------------------------------------------------------
