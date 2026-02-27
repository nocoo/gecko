/**
 * Stable hash-based color generation for categories and tags.
 *
 * Uses the same djb2 hash algorithm as avatar colors (Chinese/Unicode safe),
 * but outputs HSL inline style strings instead of Tailwind classes.
 * This allows unlimited unique colors without pre-defined palette limits.
 */

export interface HashColor {
  /** Hue value in [0, 360) */
  hue: number;
  /** Foreground / text color — saturated, mid-lightness.  e.g. hsl(210, 65%, 45%) */
  fg: string;
  /** Background color — saturated, very light. e.g. hsl(210, 60%, 92%) */
  bg: string;
  /** Subtle background — desaturated, near-white. e.g. hsl(210, 40%, 96%) */
  bgSubtle: string;
}

/** djb2 hash — same as utils.ts hashString, kept local to avoid coupling. */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate a stable color palette from any string.
 * The same input always produces the same colors.
 * Works with ASCII, Chinese, emoji, and any Unicode string.
 */
export function getHashColor(input: string): HashColor {
  const hue = hashString(input) % 360;
  return {
    hue,
    fg: `hsl(${hue}, 65%, 45%)`,
    bg: `hsl(${hue}, 60%, 92%)`,
    bgSubtle: `hsl(${hue}, 40%, 96%)`,
  };
}
