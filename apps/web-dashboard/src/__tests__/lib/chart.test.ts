import { describe, expect, test } from "vitest";
import {
  AXIS_CONFIG,
  BAR_RADIUS,
  formatDurationCompact,
  getChartColor,
  RESPONSIVE_CONTAINER_PROPS,
} from "../../lib/chart-config";
import { CHART_COLORS, chartAxis, chartMuted, chartPrimary, withAlpha } from "../../lib/palette";

// ---------------------------------------------------------------------------
// palette.ts
// ---------------------------------------------------------------------------

describe("palette", () => {
  test("CHART_COLORS uses the five Basalt series colors", () => {
    expect(CHART_COLORS).toHaveLength(5);
  });

  test("all chart colors reference CSS variables", () => {
    for (const color of CHART_COLORS) {
      expect(color).toMatch(/^hsl\(var\(--basalt-chart-\d+\)\)$/);
    }
  });

  test("withAlpha returns correct format", () => {
    expect(withAlpha("chart-1", 0.5)).toBe("hsl(var(--basalt-chart-1) / 0.5)");
    expect(withAlpha("chart-3", 0.12)).toBe("hsl(var(--basalt-chart-3) / 0.12)");
  });

  test("semantic tokens reference CSS variables", () => {
    expect(chartAxis).toContain("chart-axis");
    expect(chartMuted).toContain("chart-muted");
    expect(chartPrimary).toBe(CHART_COLORS[2]);
  });
});

// ---------------------------------------------------------------------------
// chart-config.ts
// ---------------------------------------------------------------------------

describe("chart-config", () => {
  test("getChartColor returns correct color for index", () => {
    const c0 = CHART_COLORS[0];
    const c9 = CHART_COLORS[4];

    expect(getChartColor(0)).toBe(c0);
    expect(getChartColor(9)).toBe(c9);
  });

  test("getChartColor wraps around past five", () => {
    const c0 = CHART_COLORS[0];
    const c1 = CHART_COLORS[1];
    if (!c0 || !c1) return;
    expect(getChartColor(5)).toBe(c0);
    expect(getChartColor(6)).toBe(c1);
  });

  test("AXIS_CONFIG disables axis and tick lines", () => {
    expect(AXIS_CONFIG.axisLine).toBe(false);
    expect(AXIS_CONFIG.tickLine).toBe(false);
    expect(AXIS_CONFIG.tick.fontSize).toBe(12);
  });

  test("BAR_RADIUS has correct values", () => {
    expect(BAR_RADIUS.vertical).toEqual([4, 4, 0, 0]);
    expect(BAR_RADIUS.horizontal).toEqual([0, 4, 4, 0]);
  });

  test("formatDurationCompact formats hours", () => {
    expect(formatDurationCompact(3600)).toBe("1.0h");
    expect(formatDurationCompact(5400)).toBe("1.5h");
    expect(formatDurationCompact(7200)).toBe("2.0h");
  });

  test("formatDurationCompact formats minutes", () => {
    expect(formatDurationCompact(60)).toBe("1m");
    expect(formatDurationCompact(1800)).toBe("30m");
    expect(formatDurationCompact(3599)).toBe("60m");
  });

  test("formatDurationCompact formats seconds", () => {
    expect(formatDurationCompact(30)).toBe("30s");
    expect(formatDurationCompact(0)).toBe("0s");
  });

  test("RESPONSIVE_CONTAINER_PROPS has required fields", () => {
    expect(RESPONSIVE_CONTAINER_PROPS.width).toBe("100%");
    expect(RESPONSIVE_CONTAINER_PROPS.height).toBe("100%");
    expect(RESPONSIVE_CONTAINER_PROPS.debounce).toBe(300);
  });
});
