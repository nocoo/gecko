/**
 * Stable hash-based color generation for categories and tags.
 *
 * Uses the same djb2 hash algorithm as avatar colors (Chinese/Unicode safe),
 * but outputs HSL inline style strings instead of Tailwind classes.
 * This allows unlimited unique colors without pre-defined palette limits.
 *
 * Supports light and dark mode via the `isDark` parameter:
 * - Light mode: saturated fg, very light bg
 * - Dark mode:  desaturated fg, dark bg
 */

export interface HashColor {
  /** Hue value in [0, 360) */
  hue: number;
  /** Foreground / text color */
  fg: string;
  /** Background color */
  bg: string;
  /** Subtle background */
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
 *
 * @param input - The string to hash for color generation.
 * @param isDark - Whether dark mode is active. When true, foreground uses
 *   lower saturation + higher lightness, and background uses low lightness.
 */
export function getHashColor(input: string, isDark = false): HashColor {
  const hue = hashString(input) % 360;

  if (isDark) {
    return {
      hue,
      fg: `hsl(${hue}, 55%, 65%)`,
      bg: `hsl(${hue}, 40%, 18%)`,
      bgSubtle: `hsl(${hue}, 30%, 14%)`,
    };
  }

  return {
    hue,
    fg: `hsl(${hue}, 65%, 45%)`,
    bg: `hsl(${hue}, 60%, 92%)`,
    bgSubtle: `hsl(${hue}, 40%, 96%)`,
  };
}
