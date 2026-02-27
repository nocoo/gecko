/**
 * Shared recharts configuration — axis, tooltip, bar radius, responsive container.
 */

import { CHART_COLORS as PALETTE_COLORS, chartAxis } from "./palette";

export { PALETTE_COLORS };

/** Get color from palette by index (wraps around) */
export function getChartColor(index: number): string {
  return PALETTE_COLORS[index % PALETTE_COLORS.length]!;
}

/** Common axis configuration — uses CSS variable tokens */
export const AXIS_CONFIG = {
  tick: { fontSize: 12, fill: chartAxis },
  axisLine: false as const,
  tickLine: false as const,
} as const;

/** Common bar radius for rounded corners */
export const BAR_RADIUS = {
  horizontal: [0, 4, 4, 0] as [number, number, number, number],
  vertical: [4, 4, 0, 0] as [number, number, number, number],
} as const;

/** Format duration as compact string (e.g. "1.5h", "30m") */
export function formatDurationCompact(seconds: number): string {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds)}s`;
}

/** Shared ResponsiveContainer props */
export const RESPONSIVE_CONTAINER_PROPS = {
  width: "100%" as const,
  height: "100%" as const,
  minWidth: 0,
  minHeight: 0,
  initialDimension: { width: 1, height: 1 },
  debounce: 300,
} as const;
