/**
 * Unit tests for the daily stats calculation service.
 *
 * TDD: tests written first, implementation follows.
 */

import { describe, test, expect } from "bun:test";
import {
  computeDailyStats,
  computeScores,
  mergeAdjacentSessions,
  type SessionRow,
} from "@/services/daily-stats";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal session row for testing. */
function session(
  overrides: Partial<SessionRow> & { appName: string; startTime: number; duration: number },
): SessionRow {
  return {
    id: crypto.randomUUID(),
    app_name: overrides.appName,
    bundle_id: overrides.bundleId ?? null,
    window_title: overrides.windowTitle ?? "",
    url: overrides.url ?? null,
    start_time: overrides.startTime,
    duration: overrides.duration,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeScores
// ---------------------------------------------------------------------------

describe("computeScores", () => {
  test("returns all zeros for empty sessions", () => {
    const scores = computeScores([]);
    expect(scores.focus).toBe(0);
    expect(scores.deepWork).toBe(0);
    expect(scores.switchRate).toBe(0);
    expect(scores.concentration).toBe(0);
    expect(scores.overall).toBe(0);
  });

  test("single session returns perfect scores", () => {
    const sessions = [
      session({ appName: "VSCode", startTime: 1000, duration: 3600 }),
    ];
    const scores = computeScores(sessions);

    // Focus: 3600/3600 = 100%
    expect(scores.focus).toBe(100);
    // Concentration: 1 app = 100%
    expect(scores.concentration).toBe(100);
    // Switch rate: 0 switches = 100
    expect(scores.switchRate).toBe(100);
    // Overall should be > 0
    expect(scores.overall).toBeGreaterThan(0);
  });

  // -- Focus dimension --

  test("focus score: 50% active time yields ~50", () => {
    // Active span: 0..3600 (1h), but only 1800s of work
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 900 }),
      session({ appName: "B", startTime: 2700, duration: 900 }),
    ];
    const scores = computeScores(sessions);
    // totalDuration=1800, activeSpan=3600, ratio=0.5 → score=50
    expect(scores.focus).toBe(50);
  });

  test("focus score: capped at 100 even if overlapping sessions", () => {
    // Two overlapping sessions could make totalDuration > activeSpan
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 3600 }),
      session({ appName: "B", startTime: 100, duration: 3600 }),
    ];
    const scores = computeScores(sessions);
    expect(scores.focus).toBe(100);
  });

  // -- Deep work dimension --

  test("deep work: no session >= 30min yields 0", () => {
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 600 }),
      session({ appName: "A", startTime: 600, duration: 600 }),
    ];
    const scores = computeScores(sessions);
    expect(scores.deepWork).toBe(0);
  });

  test("deep work: one merged segment >= 30min yields 40", () => {
    // Two adjacent sessions (gap < 5min) same app, total > 30min
    const sessions = [
      session({ appName: "VSCode", startTime: 0, duration: 1000 }),
      session({ appName: "VSCode", startTime: 1100, duration: 1000 }),
    ];
    const scores = computeScores(sessions);
    // Merged: 0..2100 (35min) → 1 segment ≥30min → score 40
    expect(scores.deepWork).toBe(40);
  });

  test("deep work: gap > 5min breaks merge", () => {
    const sessions = [
      session({ appName: "VSCode", startTime: 0, duration: 900 }),
      // gap of 400s (> 300s = 5min)
      session({ appName: "VSCode", startTime: 1300, duration: 900 }),
    ];
    const scores = computeScores(sessions);
    // Each segment is 15min, neither >= 30min → score 0
    expect(scores.deepWork).toBe(0);
  });

  test("deep work: 3 segments >= 30min yields 75", () => {
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 2000 }),
      session({ appName: "B", startTime: 3000, duration: 2000 }),
      session({ appName: "C", startTime: 6000, duration: 2000 }),
    ];
    const scores = computeScores(sessions);
    expect(scores.deepWork).toBe(75);
  });

  test("deep work: 5+ segments yields 100", () => {
    const sessions = [];
    for (let i = 0; i < 6; i++) {
      sessions.push(
        session({ appName: `App${i}`, startTime: i * 4000, duration: 2000 }),
      );
    }
    const scores = computeScores(sessions);
    expect(scores.deepWork).toBe(100);
  });

  // -- Switch rate dimension --

  test("switch rate: 0 switches per hour → 100", () => {
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 7200 }),
    ];
    const scores = computeScores(sessions);
    expect(scores.switchRate).toBe(100);
  });

  test("switch rate: ~10 switches/hour → 60", () => {
    // 10 switches in 1h = 10/h
    const sessions = [];
    for (let i = 0; i < 11; i++) {
      sessions.push(
        session({
          appName: i % 2 === 0 ? "A" : "B",
          startTime: i * 327, // ~3600/11
          duration: 327,
        }),
      );
    }
    const scores = computeScores(sessions);
    // 10 switches in ~1h → 60
    expect(scores.switchRate).toBe(60);
  });

  test("switch rate: >25 switches/hour → 20", () => {
    const sessions = [];
    for (let i = 0; i < 31; i++) {
      sessions.push(
        session({
          appName: i % 2 === 0 ? "A" : "B",
          startTime: i * 120, // 30 switches in 1h
          duration: 120,
        }),
      );
    }
    const scores = computeScores(sessions);
    expect(scores.switchRate).toBe(20);
  });

  // -- Concentration dimension --

  test("concentration: single app → 100", () => {
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 3600 }),
    ];
    const scores = computeScores(sessions);
    expect(scores.concentration).toBe(100);
  });

  test("concentration: 4 equal apps → 75", () => {
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 900 }),
      session({ appName: "B", startTime: 900, duration: 900 }),
      session({ appName: "C", startTime: 1800, duration: 900 }),
      session({ appName: "D", startTime: 2700, duration: 900 }),
    ];
    const scores = computeScores(sessions);
    // top3 = 2700/3600 = 75
    expect(scores.concentration).toBe(75);
  });

  // -- Overall (weighted) --

  test("overall is weighted average of 4 dimensions", () => {
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 3600 }),
    ];
    const scores = computeScores(sessions);
    const expected = Math.round(
      scores.focus * 0.3 +
      scores.deepWork * 0.3 +
      scores.switchRate * 0.2 +
      scores.concentration * 0.2,
    );
    expect(scores.overall).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// mergeAdjacentSessions
// ---------------------------------------------------------------------------

describe("mergeAdjacentSessions", () => {
  test("empty input returns empty", () => {
    expect(mergeAdjacentSessions([])).toEqual([]);
  });

  test("single session returns as-is", () => {
    const s = [session({ appName: "A", startTime: 0, duration: 1800 })];
    const merged = mergeAdjacentSessions(s);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.appName).toBe("A");
    expect(merged[0]!.totalDuration).toBe(1800);
  });

  test("merges same-app sessions with gap < 5min", () => {
    const s = [
      session({ appName: "A", startTime: 0, duration: 600 }),
      session({ appName: "A", startTime: 700, duration: 600 }),
    ];
    const merged = mergeAdjacentSessions(s);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.totalDuration).toBe(1300); // 700 + 600
  });

  test("does NOT merge different apps", () => {
    const s = [
      session({ appName: "A", startTime: 0, duration: 600 }),
      session({ appName: "B", startTime: 700, duration: 600 }),
    ];
    const merged = mergeAdjacentSessions(s);
    expect(merged).toHaveLength(2);
  });

  test("does NOT merge same app with gap >= 5min", () => {
    const s = [
      session({ appName: "A", startTime: 0, duration: 600 }),
      session({ appName: "A", startTime: 1000, duration: 600 }), // gap = 400s > 300s
    ];
    const merged = mergeAdjacentSessions(s);
    expect(merged).toHaveLength(2);
  });

  test("complex merge chain", () => {
    const s = [
      session({ appName: "A", startTime: 0, duration: 500 }),
      session({ appName: "A", startTime: 550, duration: 500 }),
      session({ appName: "A", startTime: 1100, duration: 500 }),
      session({ appName: "B", startTime: 1700, duration: 500 }),
      session({ appName: "A", startTime: 2300, duration: 500 }),
    ];
    const merged = mergeAdjacentSessions(s);
    // A(0-500) + A(550-1050) + A(1100-1600) = merged to 0..1600 (1600s)
    // B(1700-2200) = standalone
    // A(2300-2800) = standalone
    expect(merged).toHaveLength(3);
    expect(merged[0]!.appName).toBe("A");
    expect(merged[0]!.totalDuration).toBe(1600); // end of last A - start of first A
    expect(merged[1]!.appName).toBe("B");
    expect(merged[2]!.appName).toBe("A");
  });
});

// ---------------------------------------------------------------------------
// computeDailyStats
// ---------------------------------------------------------------------------

describe("computeDailyStats", () => {
  test("returns empty stats for no sessions", () => {
    const stats = computeDailyStats("2026-02-27", []);
    expect(stats.date).toBe("2026-02-27");
    expect(stats.totalDuration).toBe(0);
    expect(stats.totalSessions).toBe(0);
    expect(stats.totalApps).toBe(0);
    expect(stats.activeSpan).toBe(0);
    expect(stats.topApps).toHaveLength(0);
    expect(stats.sessions).toHaveLength(0);
    expect(stats.scores.overall).toBe(0);
  });

  test("computes correct totals for multiple sessions", () => {
    const rows = [
      session({ appName: "Chrome", bundleId: "com.google.Chrome", startTime: 1000, duration: 600 }),
      session({ appName: "VSCode", bundleId: "com.microsoft.VSCode", startTime: 1700, duration: 1200 }),
      session({ appName: "Chrome", bundleId: "com.google.Chrome", startTime: 3000, duration: 300 }),
    ];
    const stats = computeDailyStats("2026-02-27", rows);

    expect(stats.totalDuration).toBe(2100); // 600+1200+300
    expect(stats.totalSessions).toBe(3);
    expect(stats.totalApps).toBe(2);
    expect(stats.activeSpan).toBe(2300); // (3000+300) - 1000
  });

  test("topApps sorted by total duration descending", () => {
    const rows = [
      session({ appName: "A", startTime: 0, duration: 100 }),
      session({ appName: "B", startTime: 200, duration: 500 }),
      session({ appName: "A", startTime: 800, duration: 200 }),
    ];
    const stats = computeDailyStats("2026-02-27", rows);

    expect(stats.topApps[0]!.appName).toBe("B");
    expect(stats.topApps[0]!.totalDuration).toBe(500);
    expect(stats.topApps[1]!.appName).toBe("A");
    expect(stats.topApps[1]!.totalDuration).toBe(300);
  });

  test("sessions array preserves all rows with camelCase mapping", () => {
    const rows = [
      session({
        appName: "Chrome",
        bundleId: "com.google.Chrome",
        windowTitle: "GitHub",
        url: "https://github.com",
        startTime: 1000,
        duration: 600,
      }),
    ];
    const stats = computeDailyStats("2026-02-27", rows);

    expect(stats.sessions).toHaveLength(1);
    expect(stats.sessions[0]!.appName).toBe("Chrome");
    expect(stats.sessions[0]!.bundleId).toBe("com.google.Chrome");
    expect(stats.sessions[0]!.windowTitle).toBe("GitHub");
    expect(stats.sessions[0]!.url).toBe("https://github.com");
    expect(stats.sessions[0]!.startTime).toBe(1000);
    expect(stats.sessions[0]!.duration).toBe(600);
  });

  test("includes scores in output", () => {
    const rows = [
      session({ appName: "A", startTime: 0, duration: 3600 }),
    ];
    const stats = computeDailyStats("2026-02-27", rows);
    expect(stats.scores).toBeDefined();
    expect(stats.scores.focus).toBeGreaterThan(0);
    expect(stats.scores.overall).toBeGreaterThan(0);
  });
});
