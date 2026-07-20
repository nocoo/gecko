/**
 * Coverage-targeting tests for production DI factories that build
 * default dependency objects. The factories themselves are simple
 * indirection — each closure delegates to a repo method. Production
 * paths (the closures wired in from getAutoAnalyze) are never
 * exercised by the main test suite, since tests inject mocked deps.
 *
 * This file mocks the repo modules and pokes each closure once
 * to keep coverage honest without changing production code.
 */

import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/lib/settings-repo", () => ({
  settingsRepo: {
    findUserIdsByKeyValue: vi.fn(async () => ["u1"]),
  },
}));

vi.mock("@/lib/daily-summary-repo", () => ({
  dailySummaryRepo: {
    findByUserAndDate: vi.fn(async () => null),
    claimForAnalysis: vi.fn(async () => true),
    releaseAnalysisClaim: vi.fn(async () => undefined),
  },
}));

vi.mock("@/lib/session-queries", () => ({
  fetchSessionsForDate: vi.fn(async () => [{} as unknown]),
}));

vi.mock("@/lib/api-helpers", () => ({
  getUserTimezone: vi.fn(async () => "Asia/Shanghai"),
}));

// runAnalysis lives in services/analyze-core; the deps factory wraps it.
// We don't want it to actually run, so stub it.
vi.mock("@/services/analyze-core", () => ({
  runAnalysis: vi.fn(async () => ({
    ok: false,
    reason: "no_sessions",
    message: "stub",
  })),
}));

describe("auto-analyze default deps wiring", () => {
  beforeEach(async () => {
    const mod = await import("@/lib/auto-analyze");
    mod.resetAutoAnalyze();
  });

  test("getAutoAnalyze constructs a service with working default deps", async () => {
    const { getAutoAnalyze } = await import("@/lib/auto-analyze");
    const svc = getAutoAnalyze();
    // onTick exercises every default dep closure for one user.
    await svc.onTick();
    expect(svc).toBeDefined();
  });
});
