// Centralized chart / visualization color palette.
// All values reference CSS custom properties defined in globals.css.

/** Wrap a CSS custom property name for inline style usage. */
const v = (token: string) => `hsl(var(--${token}))`;

/**
 * Returns a CSS color string with alpha from a CSS custom property.
 * Usage: `withAlpha("chart-1", 0.12)` → `hsl(var(--chart-1) / 0.12)`
 */
export const withAlpha = (token: string, alpha: number) =>
  `hsl(var(--${token}) / ${alpha})`;

// ── 10 sequential chart colors ──

export const chart = {
  green: v("chart-1"), // Primary green (gecko brand)
  sky: v("chart-2"),
  amber: v("chart-3"),
  red: v("chart-4"),
  purple: v("chart-5"),
  teal: v("chart-6"),
  orange: v("chart-7"),
  blue: v("chart-8"),
  pink: v("chart-9"),
  lime: v("chart-10"),
} as const;

/** Ordered array — use for pie / donut / bar where you need N colors by index. */
export const CHART_COLORS = Object.values(chart);

/** CSS variable names (without --) matching CHART_COLORS order — for withAlpha(). */
export const CHART_TOKENS = Array.from(
  { length: 10 },
  (_, i) => `chart-${i + 1}`,
) as readonly string[];

// ── Semantic aliases ──

export const chartAxis = v("chart-axis");
export const chartMuted = v("chart-muted");

/** Primary chart accent (most-used single color) */
export const chartPrimary = chart.green;
