import { describe, expect, test } from "bun:test";
import { getHashColor, type HashColor } from "../../lib/hash-color";

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

  test("fg is a saturated mid-lightness color", () => {
    const { fg } = getHashColor("test");
    // Should have saturation 65% and lightness 45%
    expect(fg).toMatch(/hsl\(\d+,\s*65%,\s*45%\)/);
  });

  test("bg is a saturated high-lightness color", () => {
    const { bg } = getHashColor("test");
    // Should have saturation 60% and lightness 92%
    expect(bg).toMatch(/hsl\(\d+,\s*60%,\s*92%\)/);
  });

  test("bgSubtle is a very light desaturated color", () => {
    const { bgSubtle } = getHashColor("test");
    // Should have saturation 40% and lightness 96%
    expect(bgSubtle).toMatch(/hsl\(\d+,\s*40%,\s*96%\)/);
  });
});
