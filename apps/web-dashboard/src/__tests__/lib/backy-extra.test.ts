/**
 * Coverage-targeting tests for small helpers/branches that the main
 * test suites don't exercise. Kept separate from the main per-module
 * test files so the intent (close coverage gaps) stays visible.
 */

import { describe, expect, test } from "vitest";
import {
  type BackupEnvelope,
  buildTagFromEnvelope,
  compressEnvelope,
  decompressEnvelope,
} from "@/lib/backy";

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
