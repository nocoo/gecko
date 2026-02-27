import { describe, test, expect } from "bun:test";
import {
  CHART_COLORS,
  CHART_TOKENS,
  chart,
  chartAxis,
  chartMuted,
  chartPrimary,
  withAlpha,
} from "../../lib/palette";
import {
  getChartColor,
  AXIS_CONFIG,
  BAR_RADIUS,
  formatDurationCompact,
  RESPONSIVE_CONTAINER_PROPS,
} from "../../lib/chart-config";

// ---------------------------------------------------------------------------
// palette.ts
// ---------------------------------------------------------------------------

describe("palette", () => {
  test("CHART_COLORS has 10 entries", () => {
    expect(CHART_COLORS).toHaveLength(10);
  });

  test("all chart colors reference CSS variables", () => {
    for (const color of CHART_COLORS) {
      expect(color).toMatch(/^hsl\(var\(--chart-\d+\)\)$/);
    }
  });

  test("CHART_TOKENS matches CHART_COLORS order", () => {
    expect(CHART_TOKENS).toHaveLength(10);
    expect(CHART_TOKENS[0]).toBe("chart-1");
    expect(CHART_TOKENS[9]).toBe("chart-10");
  });

  test("chart named colors match CHART_COLORS values", () => {
    expect(chart.green).toBe(CHART_COLORS[0]);
    expect(chart.sky).toBe(CHART_COLORS[1]);
    expect(chart.lime).toBe(CHART_COLORS[9]);
  });

  test("withAlpha returns correct format", () => {
    expect(withAlpha("chart-1", 0.5)).toBe("hsl(var(--chart-1) / 0.5)");
    expect(withAlpha("chart-3", 0.12)).toBe("hsl(var(--chart-3) / 0.12)");
  });

  test("semantic tokens reference CSS variables", () => {
    expect(chartAxis).toContain("chart-axis");
    expect(chartMuted).toContain("chart-muted");
    expect(chartPrimary).toBe(chart.green);
  });
});

// ---------------------------------------------------------------------------
// chart-config.ts
// ---------------------------------------------------------------------------

describe("chart-config", () => {
  test("getChartColor returns correct color for index", () => {
    expect(getChartColor(0)).toBe(CHART_COLORS[0]);
    expect(getChartColor(9)).toBe(CHART_COLORS[9]);
  });

  test("getChartColor wraps around past 10", () => {
    expect(getChartColor(10)).toBe(CHART_COLORS[0]);
    expect(getChartColor(11)).toBe(CHART_COLORS[1]);
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
