/**
 * Unit tests for the daily stats calculation service.
 *
 * TDD: tests written first, implementation follows.
 */

import { describe, expect, test } from "vitest";
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
    bundle_id: overrides.bundle_id ?? null,
    window_title: overrides.window_title ?? "",
    url: overrides.url ?? null,
    start_time: overrides.startTime,
    duration: overrides.duration,
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
    const sessions = [session({ appName: "VSCode", startTime: 1000, duration: 3600 })];
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
      sessions.push(session({ appName: `App${i}`, startTime: i * 4000, duration: 2000 }));
    }
    const scores = computeScores(sessions);
    expect(scores.deepWork).toBe(100);
  });

  // -- Switch rate dimension --
  // Note: Only "deep" switches (≥5min dwell in new app) are counted
  // Dwell time accumulation respects gap threshold (5min)
  // Dev workflow URLs (localhost, 127.0.0.1, ports, hexly.ai) are excluded

  test("switch rate: 0 switches per hour → 100", () => {
    const sessions = [session({ appName: "A", startTime: 0, duration: 7200 })];
    const scores = computeScores(sessions);
    expect(scores.switchRate).toBe(100);
  });

  test("switch rate: shallow switches (<5min dwell) not counted", () => {
    // Multiple quick app switches, none with ≥5min dwell → no context switches
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 1800 }), // 30min
      session({ appName: "B", startTime: 1800, duration: 60 }), // 1min (shallow)
      session({ appName: "A", startTime: 1860, duration: 1800 }), // back to A
      session({ appName: "C", startTime: 3660, duration: 120 }), // 2min (shallow)
      session({ appName: "A", startTime: 3780, duration: 1800 }), // back to A
    ];
    const scores = computeScores(sessions);
    // B and C dwells are <5min, so they don't count as switches
    expect(scores.switchRate).toBe(100);
  });

  test("switch rate: deep switches (≥5min dwell) counted", () => {
    // 4 deep switches in ~1.17 hours
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 1800 }), // 30min
      session({ appName: "B", startTime: 1800, duration: 600 }), // 10min (deep switch)
      session({ appName: "C", startTime: 2400, duration: 600 }), // 10min (deep switch)
      session({ appName: "D", startTime: 3000, duration: 600 }), // 10min (deep switch)
      session({ appName: "E", startTime: 3600, duration: 600 }), // 10min (deep switch)
    ];
    const scores = computeScores(sessions);
    // 4 switches in ~1.17h = ~3.4/h → 100
    expect(scores.switchRate).toBe(100);
  });

  test("switch rate: many deep switches → lower score", () => {
    // Create 30 deep switches in ~2.5 hours
    const sessions = [];
    for (let i = 0; i < 31; i++) {
      sessions.push(
        session({
          appName: `App${i}`,
          startTime: i * 300, // 5min each (300s)
          duration: 300,
        }),
      );
    }
    const scores = computeScores(sessions);
    // 30 switches in ~2.5h = 12/h → 60
    expect(scores.switchRate).toBe(60);
  });

  test("switch rate: dwell time does not accumulate across large gaps", () => {
    // A -> B (1min) -> [6min gap/idle] -> B (4min)
    // Total B time is 5min, but gap breaks accumulation, so dwell = 1min only
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 1800 }), // 30min
      session({ appName: "B", startTime: 1800, duration: 60 }), // 1min
      // 360s gap (6min > 5min threshold)
      session({ appName: "B", startTime: 2220, duration: 240 }), // 4min
      session({ appName: "A", startTime: 2460, duration: 1800 }), // back to A
    ];
    const scores = computeScores(sessions);
    // B's dwell is only 1min (gap breaks accumulation), so A→B not counted
    // Second B session: dwell is 4min, still not counted
    // B→A: dwell is 30min, counted as 1 switch
    // 1 switch in ~1.18h = 0.85/h → 100
    expect(scores.switchRate).toBe(100);
  });

  test("switch rate: dwell time accumulates within gap threshold", () => {
    // A -> B (3min) -> [2min gap] -> B (3min) = 6min total dwell
    const sessions = [
      session({ appName: "A", startTime: 0, duration: 1800 }), // 30min
      session({ appName: "B", startTime: 1800, duration: 180 }), // 3min
      // 120s gap (2min < 5min threshold)
      session({ appName: "B", startTime: 2100, duration: 180 }), // 3min
      session({ appName: "A", startTime: 2280, duration: 1800 }), // back to A
    ];
    const scores = computeScores(sessions);
    // B's dwell is 6min (gap within threshold), so A→B counted
    // B→A: dwell is 30min, counted
    // 2 switches in ~1.13h = 1.77/h → 100
    expect(scores.switchRate).toBe(100);
  });

  test("switch rate: IDE ↔ localhost does NOT count as switch", () => {
    // VSCode ↔ Chrome(localhost) is normal dev workflow, should not penalize
    const sessions = [
      session({ appName: "VSCode", startTime: 0, duration: 600 }), // 10min coding
      session({
        appName: "Chrome",
        url: "http://localhost:3000/app",
        startTime: 600,
        duration: 600, // 10min preview
      }),
      session({ appName: "VSCode", startTime: 1200, duration: 600 }), // 10min coding
      session({
        appName: "Chrome",
        url: "http://127.0.0.1:5173/test",
        startTime: 1800,
        duration: 600, // 10min preview
      }),
      session({ appName: "VSCode", startTime: 2400, duration: 600 }), // 10min coding
    ];
    const scores = computeScores(sessions);
    // All Chrome sessions have dev workflow URLs → excluded from switch counting
    expect(scores.switchRate).toBe(100);
  });

  test("switch rate: IDE ↔ social media DOES count as switch", () => {
    // VSCode ↔ Chrome(x.com) is distraction, should count as switch
    const sessions = [
      session({ appName: "VSCode", startTime: 0, duration: 600 }), // 10min coding
      session({
        appName: "Chrome",
        url: "https://x.com/feed",
        startTime: 600,
        duration: 600, // 10min on Twitter
      }),
      session({ appName: "VSCode", startTime: 1200, duration: 600 }), // 10min coding
      session({
        appName: "Chrome",
        url: "https://youtube.com/watch",
        startTime: 1800,
        duration: 600, // 10min on YouTube
      }),
      session({ appName: "VSCode", startTime: 2400, duration: 600 }), // 10min coding
    ];
    const scores = computeScores(sessions);
    // 4 switches in 50min (0.83h) = 4.8/h → 80 (4 < x ≤ 8)
    // Social media URLs are NOT dev workflow, so they count as real switches
    expect(scores.switchRate).toBe(80);
  });

  test("switch rate: high-port URLs treated as dev workflow", () => {
    const sessions = [
      session({ appName: "VSCode", startTime: 0, duration: 600 }),
      session({
        appName: "Chrome",
        url: "http://staging.example.com:8080/api",
        startTime: 600,
        duration: 600,
      }),
      session({ appName: "VSCode", startTime: 1200, duration: 600 }),
    ];
    const scores = computeScores(sessions);
    // Port 8080 → dev workflow → excluded
    expect(scores.switchRate).toBe(100);
  });

  test("switch rate: hexly.ai domains treated as dev workflow", () => {
    const sessions = [
      session({ appName: "VSCode", startTime: 0, duration: 600 }),
      session({
        appName: "Chrome",
        url: "https://app.hexly.ai/dashboard",
        startTime: 600,
        duration: 600,
      }),
      session({ appName: "VSCode", startTime: 1200, duration: 600 }),
      session({
        appName: "Chrome",
        url: "https://hexly.ai/docs",
        startTime: 1800,
        duration: 600,
      }),
    ];
    const scores = computeScores(sessions);
    // hexly.ai and *.hexly.ai → dev workflow → excluded
    expect(scores.switchRate).toBe(100);
  });

  // -- Concentration dimension --

  test("concentration: single app → 100", () => {
    const sessions = [session({ appName: "A", startTime: 0, duration: 3600 })];
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
    const sessions = [session({ appName: "A", startTime: 0, duration: 3600 })];
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
      session({
        appName: "Chrome",
        bundle_id: "com.google.Chrome",
        startTime: 1000,
        duration: 600,
      }),
      session({
        appName: "VSCode",
        bundle_id: "com.microsoft.VSCode",
        startTime: 1700,
        duration: 1200,
      }),
      session({
        appName: "Chrome",
        bundle_id: "com.google.Chrome",
        startTime: 3000,
        duration: 300,
      }),
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
        bundle_id: "com.google.Chrome",
        window_title: "GitHub",
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
    const rows = [session({ appName: "A", startTime: 0, duration: 3600 })];
    const stats = computeDailyStats("2026-02-27", rows);
    expect(stats.scores).toBeDefined();
    expect(stats.scores.focus).toBeGreaterThan(0);
    expect(stats.scores.overall).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Branch coverage: switchRate ladder & zero activeSpan
// ---------------------------------------------------------------------------

describe("computeScores branch coverage", () => {
  test("switch rate: 8 < x ≤ 15 switches/h yields 60", () => {
    // 12 deep switches in ~1h → 12/h → 60
    const sessions: SessionRow[] = [];
    for (let i = 0; i < 13; i++) {
      sessions.push(session({ appName: `App${i}`, startTime: i * 300, duration: 300 }));
    }
    const scores = computeScores(sessions);
    // 12 switches in ~1.08h ≈ 11/h → 60
    expect(scores.switchRate).toBe(60);
  });

  test("switch rate: 15 < x ≤ 25 switches/h yields 40", () => {
    // 22 deep switches in ~1.1h → 20/h → 40
    const sessions: SessionRow[] = [];
    for (let i = 0; i < 23; i++) {
      sessions.push(session({ appName: `App${i}`, startTime: i * 180, duration: 300 }));
    }
    const scores = computeScores(sessions);
    expect(scores.switchRate).toBe(40);
  });

  test("switch rate: > 25 switches/h yields 20", () => {
    // 35 deep switches in ~0.5h → 70/h → 20
    const sessions: SessionRow[] = [];
    for (let i = 0; i < 36; i++) {
      sessions.push(session({ appName: `App${i}`, startTime: i * 50, duration: 300 }));
    }
    const scores = computeScores(sessions);
    expect(scores.switchRate).toBe(20);
  });

  test("zero activeSpan (single zero-duration session) yields focus=0", () => {
    const sessions = [session({ appName: "A", startTime: 1000, duration: 0 })];
    const scores = computeScores(sessions);
    expect(scores.focus).toBe(0);
    // switchesPerHour falls into the activeHours <= 0 branch
    expect(scores.switchRate).toBe(100);
  });

  test("zero totalDuration yields concentration=0", () => {
    // Multiple zero-duration sessions at same timestamp
    const sessions = [
      session({ appName: "A", startTime: 1000, duration: 0 }),
      session({ appName: "B", startTime: 1000, duration: 0 }),
    ];
    const scores = computeScores(sessions);
    expect(scores.concentration).toBe(0);
  });

  test("isDevWorkflowUrl: invalid URL string is treated as non-dev", () => {
    // URL constructor throws → caught → returns false (not a dev URL)
    const sessions = [
      session({ appName: "VSCode", startTime: 0, duration: 600 }),
      session({
        appName: "Chrome",
        url: "not a valid url",
        startTime: 600,
        duration: 600,
      }),
      session({ appName: "VSCode", startTime: 1200, duration: 600 }),
    ];
    const scores = computeScores(sessions);
    // Invalid URL → not dev workflow → switches counted
    // 2 switches in 30min = 4/h → 100 (still in ≤4 band)
    expect(scores.switchRate).toBe(100);
  });
});
