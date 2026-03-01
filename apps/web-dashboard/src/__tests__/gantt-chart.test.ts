/**
 * Unit tests for the Gantt chart data transformation functions.
 */

import { describe, test, expect } from "bun:test";
import { buildGanttData, formatTime } from "@/components/daily/gantt-chart";
import type { SessionForChart, AppSummary } from "@/services/daily-stats";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// 2026-02-27 09:00:00 in Asia/Shanghai (UTC+8) = 2026-02-27T01:00:00Z
const BASE_EPOCH = Date.UTC(2026, 1, 27, 1, 0, 0) / 1000;

// Use Asia/Shanghai consistently for all tests
const TZ = "Asia/Shanghai";

const sessions: SessionForChart[] = [
  {
    id: "1",
    appName: "VS Code",
    bundleId: "com.microsoft.vscode",
    windowTitle: "main.ts",
    url: null,
    startTime: BASE_EPOCH,
    duration: 3600, // 1h
  },
  {
    id: "2",
    appName: "Chrome",
    bundleId: "com.google.chrome",
    windowTitle: "GitHub",
    url: "https://github.com",
    startTime: BASE_EPOCH + 3600,
    duration: 1800, // 30m
  },
  {
    id: "3",
    appName: "VS Code",
    bundleId: "com.microsoft.vscode",
    windowTitle: "utils.ts",
    url: null,
    startTime: BASE_EPOCH + 5400,
    duration: 2400, // 40m
  },
  {
    id: "4",
    appName: "Slack",
    bundleId: "com.slack.desktop",
    windowTitle: "#general",
    url: null,
    startTime: BASE_EPOCH + 7800,
    duration: 600, // 10m
  },
];

const topApps: AppSummary[] = [
  { appName: "VS Code", bundleId: "com.microsoft.vscode", totalDuration: 6000, sessionCount: 2 },
  { appName: "Chrome", bundleId: "com.google.chrome", totalDuration: 1800, sessionCount: 1 },
  { appName: "Slack", bundleId: "com.slack.desktop", totalDuration: 600, sessionCount: 1 },
];

// ---------------------------------------------------------------------------
// formatTime
// ---------------------------------------------------------------------------

describe("formatTime", () => {
  test("formats midnight", () => {
    expect(formatTime(0)).toBe("00:00");
  });

  test("formats 9:30", () => {
    expect(formatTime(570)).toBe("09:30");
  });

  test("formats 14:05", () => {
    expect(formatTime(845)).toBe("14:05");
  });

  test("formats 23:59", () => {
    expect(formatTime(1439)).toBe("23:59");
  });
});

// ---------------------------------------------------------------------------
// buildGanttData
// ---------------------------------------------------------------------------

describe("buildGanttData", () => {
  test("returns empty for no sessions", () => {
    const result = buildGanttData([], [], TZ);
    expect(result.rows).toEqual([]);
    expect(result.dayStartMin).toBe(0);
    expect(result.dayEndMin).toBe(0);
  });

  test("produces correct number of rows", () => {
    const { rows } = buildGanttData(sessions, topApps, TZ);
    expect(rows).toHaveLength(3);
  });

  test("rows follow topApps order (by total duration)", () => {
    const { rows } = buildGanttData(sessions, topApps, TZ);
    expect(rows[0]!.appName).toBe("VS Code");
    expect(rows[1]!.appName).toBe("Chrome");
    expect(rows[2]!.appName).toBe("Slack");
  });

  test("VS Code row has 2 segments", () => {
    const { rows } = buildGanttData(sessions, topApps, TZ);
    const vscode = rows[0]!;
    expect(vscode.segments).toHaveLength(2);
    expect(vscode.totalDuration).toBe(6000);
  });

  test("Chrome row has 1 segment", () => {
    const { rows } = buildGanttData(sessions, topApps, TZ);
    const chrome = rows[1]!;
    expect(chrome.segments).toHaveLength(1);
    expect(chrome.segments[0]!.durationSec).toBe(1800);
  });

  test("segment startMin is relative to midnight", () => {
    const { rows } = buildGanttData(sessions, topApps, TZ);
    const firstSegment = rows[0]!.segments[0]!;
    // startTime = BASE_EPOCH which is 09:00 in Asia/Shanghai
    expect(firstSegment.startMin).toBeCloseTo(540, 0); // 9h * 60
  });

  test("dayStartMin and dayEndMin bracket the sessions", () => {
    const { dayStartMin, dayEndMin } = buildGanttData(sessions, topApps, TZ);
    // First session at 09:00, last ends at ~11:20
    expect(dayStartMin).toBeLessThanOrEqual(540);
    expect(dayEndMin).toBeGreaterThanOrEqual(680);
  });

  test("each segment has a color", () => {
    const { rows } = buildGanttData(sessions, topApps, TZ);
    for (const row of rows) {
      for (const seg of row.segments) {
        expect(seg.color).toMatch(/^hsl\(/);
      }
    }
  });

  test("segments within same app have same color", () => {
    const { rows } = buildGanttData(sessions, topApps, TZ);
    const vscode = rows[0]!;
    const colors = new Set(vscode.segments.map((s) => s.color));
    expect(colors.size).toBe(1);
  });

  test("different apps have different colors (usually)", () => {
    const { rows } = buildGanttData(sessions, topApps, TZ);
    const colors = rows.map((r) => r.segments[0]!.color);
    // Very unlikely all 3 different app names hash to the same color
    expect(new Set(colors).size).toBeGreaterThan(1);
  });

  test("single session produces valid data", () => {
    const single: SessionForChart[] = [
      {
        id: "x",
        appName: "Terminal",
        bundleId: null,
        windowTitle: "bash",
        url: null,
        startTime: BASE_EPOCH,
        duration: 300,
      },
    ];
    const singleApp: AppSummary[] = [
      { appName: "Terminal", bundleId: null, totalDuration: 300, sessionCount: 1 },
    ];
    const { rows, dayStartMin, dayEndMin } = buildGanttData(single, singleApp, TZ);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.segments).toHaveLength(1);
    expect(dayEndMin).toBeGreaterThan(dayStartMin);
  });

  test("overnight session: dayEndMin can exceed 1440", () => {
    // loginwindow session starting at 20:37 CST, duration 8.8 hours (31680s)
    // ends at ~05:25 next day CST = 1765 min since midnight
    const eveningEpoch = BASE_EPOCH + 11 * 3600 + 37 * 60; // 20:37 CST
    const overnightSessions: SessionForChart[] = [
      {
        id: "overnight",
        appName: "loginwindow",
        bundleId: null,
        windowTitle: "loginwindow",
        url: null,
        startTime: eveningEpoch,
        duration: 31680, // 8h 48min
      },
    ];
    const overnightApps: AppSummary[] = [
      { appName: "loginwindow", bundleId: null, totalDuration: 31680, sessionCount: 1 },
    ];
    const { dayStartMin, dayEndMin } = buildGanttData(overnightSessions, overnightApps, TZ);
    // Session starts at 20:37 (1237 min) and ends at ~05:25 next day (1765 min)
    expect(dayStartMin).toBeCloseTo(1237, -1);
    expect(dayEndMin).toBeGreaterThan(1440); // Exceeds midnight
  });

  test("bar clamping: segment extending past xMax is truncated", () => {
    // Simulate the clamping logic used in the component render
    // xMin=0, xMax=1440, range=1440
    const xMin = 0;
    const xMax = 1440;
    const range = xMax - xMin;

    // A segment starting at 20:37 (1237 min) with duration 528 min (end=1765)
    const segStartMin = 1237;
    const segDurationMin = 528;
    const segEnd = segStartMin + segDurationMin; // 1765

    const clampedStart = Math.max(xMin, segStartMin);
    const clampedEnd = Math.min(xMax, segEnd);

    const left = ((clampedStart - xMin) / range) * 100;
    const width = ((clampedEnd - clampedStart) / range) * 100;

    // Bar should start at ~85.9% and have width ~14.1% (truncated at 1440)
    expect(left).toBeCloseTo(85.9, 0);
    expect(width).toBeCloseTo(14.1, 0);
    expect(left + width).toBeLessThanOrEqual(100); // Never exceeds 100%
  });

  test("bar clamping: segment entirely before xMin is skipped", () => {
    const xMin = 300; // 05:00
    const xMax = 1440;

    const segStartMin = 0;
    const segDurationMin = 200; // ends at 200, before xMin

    const clampedStart = Math.max(xMin, segStartMin);
    const clampedEnd = Math.min(xMax, segStartMin + segDurationMin);

    // clampedStart (300) >= clampedEnd (200) → segment should be skipped
    expect(clampedStart >= clampedEnd).toBe(true);
  });

  test("bar clamping: segment starting before xMin is left-truncated", () => {
    const xMin = 300;
    const xMax = 1440;
    const range = xMax - xMin;

    // Session from 04:00 (240 min) to 06:00 (360 min)
    const segStartMin = 240;
    const segDurationMin = 120;

    const clampedStart = Math.max(xMin, segStartMin); // 300
    const clampedEnd = Math.min(xMax, segStartMin + segDurationMin); // 360

    const left = ((clampedStart - xMin) / range) * 100; // 0%
    const width = ((clampedEnd - clampedStart) / range) * 100; // ~5.26%

    expect(left).toBe(0);
    expect(width).toBeCloseTo(5.26, 1);
    expect(left + width).toBeLessThanOrEqual(100);
  });
});
