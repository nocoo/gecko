import { describe, expect, test } from "bun:test";
import { getHashColor } from "../../lib/hash-color";

describe("getHashColor", () => {
  test("returns an object with hue, fg, bg, and bgSubtle", () => {
    const result = getHashColor("browser");
    expect(result).toHaveProperty("hue");
    expect(result).toHaveProperty("fg");
    expect(result).toHaveProperty("bg");
    expect(result).toHaveProperty("bgSubtle");
    expect(typeof result.hue).toBe("number");
    expect(typeof result.fg).toBe("string");
    expect(typeof result.bg).toBe("string");
    expect(typeof result.bgSubtle).toBe("string");
  });

  test("hue is in [0, 360) range", () => {
    const inputs = [
      "browser",
      "system-core",
      "application",
      "com.google.Chrome",
      "productivity",
      "中文标签",
      "🦎",
      "",
    ];
    for (const input of inputs) {
      const { hue } = getHashColor(input);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  test("returns stable results for the same input", () => {
    const a = getHashColor("browser");
    const b = getHashColor("browser");
    expect(a).toEqual(b);
  });

  test("returns different hues for different inputs", () => {
    const a = getHashColor("browser");
    const b = getHashColor("system-core");
    const c = getHashColor("application");
    // It's theoretically possible for collisions, but these specific
    // strings should produce different hues
    const hues = new Set([a.hue, b.hue, c.hue]);
    expect(hues.size).toBe(3);
  });

  test("handles Chinese strings correctly", () => {
    const a = getHashColor("工作");
    const b = getHashColor("娱乐");
    expect(a.hue).not.toBe(b.hue);
    // Verify it produces valid HSL strings
    expect(a.fg).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
    expect(a.bg).toMatch(/^hsl\(\d+,\s*\d+%,\s*\d+%\)$/);
  });

  test("handles empty string without throwing", () => {
    const result = getHashColor("");
    expect(result.hue).toBe(0); // hash of "" is 0, 0 % 360 = 0
    expect(result.fg).toContain("hsl(0,");
  });

  // Light mode (default)
  test("fg is a saturated mid-lightness color in light mode", () => {
    const { fg } = getHashColor("test");
    expect(fg).toMatch(/hsl\(\d+,\s*65%,\s*45%\)/);
  });

  test("bg is a saturated high-lightness color in light mode", () => {
    const { bg } = getHashColor("test");
    expect(bg).toMatch(/hsl\(\d+,\s*60%,\s*92%\)/);
  });

  test("bgSubtle is a very light desaturated color in light mode", () => {
    const { bgSubtle } = getHashColor("test");
    expect(bgSubtle).toMatch(/hsl\(\d+,\s*40%,\s*96%\)/);
  });

  // Dark mode
  test("fg uses lower saturation and higher lightness in dark mode", () => {
    const { fg } = getHashColor("test", true);
    expect(fg).toMatch(/hsl\(\d+,\s*55%,\s*65%\)/);
  });

  test("bg uses low lightness in dark mode", () => {
    const { bg } = getHashColor("test", true);
    expect(bg).toMatch(/hsl\(\d+,\s*40%,\s*18%\)/);
  });

  test("bgSubtle uses very low lightness in dark mode", () => {
    const { bgSubtle } = getHashColor("test", true);
    expect(bgSubtle).toMatch(/hsl\(\d+,\s*30%,\s*14%\)/);
  });

  test("hue is the same regardless of isDark", () => {
    const light = getHashColor("browser", false);
    const dark = getHashColor("browser", true);
    expect(light.hue).toBe(dark.hue);
  });
});
