/**
 * Unit tests for score card utility functions.
 */

import { describe, test, expect } from "bun:test";
import {
  getScoreColor,
  getScoreLabel,
  SCORE_DIMENSIONS,
} from "@/components/daily/score-cards";

// ---------------------------------------------------------------------------
// getScoreColor
// ---------------------------------------------------------------------------

describe("getScoreColor", () => {
  test("returns green for score > 70", () => {
    const color = getScoreColor(85);
    expect(color.text).toContain("success");
    expect(color.stroke).toBe("hsl(var(--success))");
  });

  test("returns green for score = 71", () => {
    const color = getScoreColor(71);
    expect(color.text).toContain("success");
  });

  test("returns amber for score = 70", () => {
    const color = getScoreColor(70);
    expect(color.text).toContain("warning");
    expect(color.stroke).toBe("hsl(var(--warning))");
  });

  test("returns amber for score = 40", () => {
    const color = getScoreColor(40);
    expect(color.text).toContain("warning");
  });

  test("returns red for score = 39", () => {
    const color = getScoreColor(39);
    expect(color.text).toContain("destructive");
    expect(color.stroke).toBe("hsl(var(--destructive))");
  });

  test("returns red for score = 0", () => {
    const color = getScoreColor(0);
    expect(color.text).toContain("destructive");
  });

  test("returns red for score = 100", () => {
    const color = getScoreColor(100);
    expect(color.text).toContain("success");
  });
});

// ---------------------------------------------------------------------------
// getScoreLabel
// ---------------------------------------------------------------------------

describe("getScoreLabel", () => {
  test("returns 'Excellent' for score >= 85", () => {
    expect(getScoreLabel(85)).toBe("Excellent");
    expect(getScoreLabel(100)).toBe("Excellent");
  });

  test("returns 'Good' for score 70-84", () => {
    expect(getScoreLabel(70)).toBe("Good");
    expect(getScoreLabel(84)).toBe("Good");
  });

  test("returns 'Fair' for score 55-69", () => {
    expect(getScoreLabel(55)).toBe("Fair");
    expect(getScoreLabel(69)).toBe("Fair");
  });

  test("returns 'Needs Work' for score 40-54", () => {
    expect(getScoreLabel(40)).toBe("Needs Work");
    expect(getScoreLabel(54)).toBe("Needs Work");
  });

  test("returns 'Poor' for score < 40", () => {
    expect(getScoreLabel(39)).toBe("Poor");
    expect(getScoreLabel(0)).toBe("Poor");
  });
});

// ---------------------------------------------------------------------------
// SCORE_DIMENSIONS
// ---------------------------------------------------------------------------

describe("SCORE_DIMENSIONS", () => {
  test("has 4 dimensions", () => {
    expect(SCORE_DIMENSIONS).toHaveLength(4);
  });

  test("weights sum to 1.0", () => {
    const total = SCORE_DIMENSIONS.reduce((sum, d) => sum + d.weight, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  test("all dimension keys match DailyScores", () => {
    const keys = SCORE_DIMENSIONS.map((d) => d.key);
    expect(keys).toContain("focus");
    expect(keys).toContain("deepWork");
    expect(keys).toContain("switchRate");
    expect(keys).toContain("concentration");
  });

  test("every dimension has a non-empty label and description", () => {
    for (const dim of SCORE_DIMENSIONS) {
      expect(dim.label.length).toBeGreaterThan(0);
      expect(dim.description.length).toBeGreaterThan(0);
    }
  });

  test("every weight is between 0 and 1 exclusive", () => {
    for (const dim of SCORE_DIMENSIONS) {
      expect(dim.weight).toBeGreaterThan(0);
      expect(dim.weight).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// getScoreColor — additional boundary tests
// ---------------------------------------------------------------------------

describe("getScoreColor boundary", () => {
  test("all return objects have required keys", () => {
    for (const score of [0, 39, 40, 70, 71, 100]) {
      const color = getScoreColor(score);
      expect(color).toHaveProperty("text");
      expect(color).toHaveProperty("bg");
      expect(color).toHaveProperty("ring");
      expect(color).toHaveProperty("stroke");
    }
  });

  test("negative score returns red", () => {
    const color = getScoreColor(-10);
    expect(color.text).toContain("destructive");
  });
});

// ---------------------------------------------------------------------------
// getScoreLabel — additional boundary tests
// ---------------------------------------------------------------------------

describe("getScoreLabel boundary", () => {
  test("exact boundary at 85", () => {
    expect(getScoreLabel(85)).toBe("Excellent");
    expect(getScoreLabel(84)).toBe("Good");
  });

  test("exact boundary at 55", () => {
    expect(getScoreLabel(55)).toBe("Fair");
    expect(getScoreLabel(54)).toBe("Needs Work");
  });

  test("negative score returns Poor", () => {
    expect(getScoreLabel(-5)).toBe("Poor");
  });
});
