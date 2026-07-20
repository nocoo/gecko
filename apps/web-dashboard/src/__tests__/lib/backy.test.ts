/**
 * Tests for backy.ts — types and pure utility functions.
 */

import { describe, expect, test } from "vitest";
import {
  BACKUP_SCHEMA_VERSION,
  BACKY_SETTING_KEYS,
  type BackupEnvelope,
  type BackupStats,
  buildBackupTag,
  buildFileName,
  compressEnvelope,
  decompressEnvelope,
  envelopeStats,
  isBackySettingKey,
  todayUTC,
} from "@/lib/backy";

// ---------------------------------------------------------------------------
// Fixture: minimal valid envelope
// ---------------------------------------------------------------------------

function makeEnvelope(overrides: Partial<BackupEnvelope> = {}): BackupEnvelope {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    appVersion: "1.1.2",
    exportedAt: "2026-03-02T10:00:00.000Z",
    userId: "user-1",
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// envelopeStats
// ---------------------------------------------------------------------------

describe("envelopeStats", () => {
  test("returns zeroes for empty envelope", () => {
    const stats = envelopeStats(makeEnvelope());
    expect(stats).toEqual({
      sessions: 0,
      categories: 0,
      tags: 0,
      appNotes: 0,
      dailySummaries: 0,
      settings: 0,
      apiKeys: 0,
      syncLogs: 0,
    });
  });

  test("counts populated arrays", () => {
    const env = makeEnvelope({
      focusSessions: Array.from({ length: 42 }, (_, i) => ({
        id: `s-${i}`,
        user_id: "u",
        device_id: "d",
        app_name: "App",
        window_title: "Win",
        url: null,
        start_time: 0,
        end_time: null,
        duration: 10,
        bundle_id: null,
        tab_title: null,
        tab_count: null,
        document_path: null,
        is_full_screen: null,
        is_minimized: null,
        synced_at: null,
      })),
      categories: [
        {
          id: "c1",
          user_id: "u",
          title: "Dev",
          icon: "code",
          is_default: 0,
          slug: "dev",
          created_at: "",
        },
        {
          id: "c2",
          user_id: "u",
          title: "Browser",
          icon: "globe",
          is_default: 1,
          slug: "browser",
          created_at: "",
        },
      ],
      tags: [{ id: "t1", user_id: "u", name: "work", created_at: "" }],
    });

    const stats = envelopeStats(env);
    expect(stats.sessions).toBe(42);
    expect(stats.categories).toBe(2);
    expect(stats.tags).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildBackupTag
// ---------------------------------------------------------------------------

describe("buildBackupTag", () => {
  test("formats tag with version, date, and stats", () => {
    const stats: BackupStats = {
      sessions: 60000,
      categories: 4,
      tags: 5,
      appNotes: 10,
      dailySummaries: 180,
      settings: 6,
      apiKeys: 2,
      syncLogs: 3000,
    };
    const tag = buildBackupTag("1.1.2", "2026-03-02", stats);
    expect(tag).toBe("v1.1.2-2026-03-02-60000sess-4cat-5tag");
  });

  test("works with zero counts", () => {
    const stats: BackupStats = {
      sessions: 0,
      categories: 0,
      tags: 0,
      appNotes: 0,
      dailySummaries: 0,
      settings: 0,
      apiKeys: 0,
      syncLogs: 0,
    };
    expect(buildBackupTag("0.1.0", "2026-01-01", stats)).toBe("v0.1.0-2026-01-01-0sess-0cat-0tag");
  });
});

// ---------------------------------------------------------------------------
// buildFileName
// ---------------------------------------------------------------------------

describe("buildFileName", () => {
  test("returns correct gzip filename", () => {
    expect(buildFileName("2026-03-02")).toBe("gecko-backup-2026-03-02.json.gz");
  });

  test("includes the date as-is", () => {
    expect(buildFileName("2025-12-31")).toBe("gecko-backup-2025-12-31.json.gz");
  });
});

// ---------------------------------------------------------------------------
// todayUTC
// ---------------------------------------------------------------------------

describe("todayUTC", () => {
  test("returns YYYY-MM-DD format", () => {
    expect(todayUTC()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("matches current UTC date", () => {
    const now = new Date();
    const expected = now.toISOString().slice(0, 10);
    expect(todayUTC()).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// compressEnvelope / decompressEnvelope (roundtrip)
// ---------------------------------------------------------------------------

describe("compress / decompress roundtrip", () => {
  test("empty envelope roundtrips correctly", () => {
    const original = makeEnvelope();
    const compressed = compressEnvelope(original);

    expect(compressed).toBeInstanceOf(Buffer);
    expect(compressed.length).toBeGreaterThan(0);
    // gzip magic number: 0x1f 0x8b
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);

    const restored = decompressEnvelope(compressed);
    expect(restored).toEqual(original);
  });

  test("envelope with data roundtrips correctly", () => {
    const original = makeEnvelope({
      focusSessions: [
        {
          id: "s-1",
          user_id: "u",
          device_id: "d",
          app_name: "Chrome",
          window_title: "GitHub",
          url: "https://github.com",
          start_time: 1709337600,
          end_time: null,
          duration: 300,
          bundle_id: "com.google.Chrome",
          tab_title: "GitHub",
          tab_count: 12,
          document_path: null,
          is_full_screen: 0,
          is_minimized: 0,
          synced_at: "2026-03-02T10:00:00Z",
        },
      ],
      settings: [
        {
          user_id: "u",
          key: "timezone",
          value: "Asia/Shanghai",
          updated_at: 1709337600000,
        },
      ],
    });

    const compressed = compressEnvelope(original);
    const restored = decompressEnvelope(compressed);
    expect(restored).toEqual(original);
    expect(restored.focusSessions).toHaveLength(1);
    const fs0 = restored.focusSessions[0];
    if (!fs0) return;
    expect(fs0).toBeDefined();
    expect(fs0.app_name).toBe("Chrome");
    expect(restored.settings).toHaveLength(1);
    const s0 = restored.settings[0];
    if (!s0) return;
    expect(s0).toBeDefined();
    expect(s0.key).toBe("timezone");
  });

  test("compressed size is smaller than JSON for non-trivial data", () => {
    // Create an envelope with repetitive data (compresses well)
    const sessions = Array.from({ length: 100 }, (_, i) => ({
      id: `session-${i}`,
      user_id: "user-1",
      device_id: "device-1",
      app_name: "Google Chrome",
      window_title: `Tab ${i} - Some Website`,
      url: `https://example.com/page/${i}`,
      start_time: 1709337600 + i * 60,
      end_time: null,
      duration: 55,
      bundle_id: "com.google.Chrome",
      tab_title: `Tab ${i}`,
      tab_count: 15,
      document_path: null,
      is_full_screen: 0,
      is_minimized: 0,
      synced_at: "2026-03-02T10:00:00Z",
    }));
    const env = makeEnvelope({ focusSessions: sessions });

    const jsonSize = Buffer.byteLength(JSON.stringify(env), "utf-8");
    const gzipSize = compressEnvelope(env).length;

    expect(gzipSize).toBeLessThan(jsonSize);
  });
});

// ---------------------------------------------------------------------------
// isBackySettingKey
// ---------------------------------------------------------------------------

describe("isBackySettingKey", () => {
  test("returns true for backy-internal keys", () => {
    expect(isBackySettingKey("backy.webhookUrl")).toBe(true);
    expect(isBackySettingKey("backy.apiKey")).toBe(true);
    expect(isBackySettingKey("backy.pullKey")).toBe(true);
  });

  test("returns false for non-backy keys", () => {
    expect(isBackySettingKey("timezone")).toBe(false);
    expect(isBackySettingKey("ai.provider")).toBe(false);
    expect(isBackySettingKey("backy.something")).toBe(false);
  });

  test("BACKY_SETTING_KEYS has exactly 3 entries", () => {
    expect(BACKY_SETTING_KEYS).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// BACKUP_SCHEMA_VERSION
// ---------------------------------------------------------------------------

describe("BACKUP_SCHEMA_VERSION", () => {
  test("is 1", () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(1);
  });
});
