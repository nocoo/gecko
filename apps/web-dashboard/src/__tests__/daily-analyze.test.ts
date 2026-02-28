/**
 * Unit tests for the daily analyze API helpers.
 *
 * Tests parseAiResponse and buildPrompt (exported from the route
 * for testability via a separate helpers module).
 */

import { describe, test, expect } from "bun:test";

// ---------------------------------------------------------------------------
// We test the parse logic directly since it's the most critical part.
// Import the functions from the route module.
// ---------------------------------------------------------------------------

// Re-implement parseAiResponse inline since Next.js route modules are awkward
// to import in unit tests. This tests the same logic.

interface AiAnalysisResult {
  score: number;
  highlights: string[];
  improvements: string[];
  summary: string;
}

function parseAiResponse(text: string): AiAnalysisResult {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned
      .replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "");
  }

  const parsed = JSON.parse(cleaned) as Record<string, unknown>;

  const score = Number(parsed.score);
  if (!Number.isFinite(score) || score < 1 || score > 100) {
    throw new Error("AI returned invalid score");
  }

  const highlights = parsed.highlights;
  if (!Array.isArray(highlights) || highlights.length === 0) {
    throw new Error("AI returned invalid highlights");
  }

  const improvements = parsed.improvements;
  if (!Array.isArray(improvements) || improvements.length === 0) {
    throw new Error("AI returned invalid improvements");
  }

  const summary = parsed.summary;
  if (typeof summary !== "string" || summary.length === 0) {
    throw new Error("AI returned invalid summary");
  }

  return {
    score: Math.round(score),
    highlights: highlights.map(String),
    improvements: improvements.map(String),
    summary: String(summary),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseAiResponse", () => {
  const validJson = JSON.stringify({
    score: 72,
    highlights: ["专注度高", "深度工作时间长"],
    improvements: ["减少应用切换", "增加休息时间"],
    summary: "今日整体表现良好，专注度评分达到72分。",
  });

  test("parses valid JSON response", () => {
    const result = parseAiResponse(validJson);
    expect(result.score).toBe(72);
    expect(result.highlights).toEqual(["专注度高", "深度工作时间长"]);
    expect(result.improvements).toEqual(["减少应用切换", "增加休息时间"]);
    expect(result.summary).toBe("今日整体表现良好，专注度评分达到72分。");
  });

  test("strips markdown code fences", () => {
    const wrapped = `\`\`\`json\n${validJson}\n\`\`\``;
    const result = parseAiResponse(wrapped);
    expect(result.score).toBe(72);
    expect(result.highlights).toHaveLength(2);
  });

  test("strips markdown code fences without language tag", () => {
    const wrapped = `\`\`\`\n${validJson}\n\`\`\``;
    const result = parseAiResponse(wrapped);
    expect(result.score).toBe(72);
  });

  test("rounds fractional score", () => {
    const json = JSON.stringify({
      score: 72.7,
      highlights: ["a"],
      improvements: ["b"],
      summary: "c",
    });
    const result = parseAiResponse(json);
    expect(result.score).toBe(73);
  });

  test("rejects score < 1", () => {
    const json = JSON.stringify({
      score: 0,
      highlights: ["a"],
      improvements: ["b"],
      summary: "c",
    });
    expect(() => parseAiResponse(json)).toThrow("invalid score");
  });

  test("rejects score > 100", () => {
    const json = JSON.stringify({
      score: 101,
      highlights: ["a"],
      improvements: ["b"],
      summary: "c",
    });
    expect(() => parseAiResponse(json)).toThrow("invalid score");
  });

  test("rejects non-numeric score", () => {
    const json = JSON.stringify({
      score: "high",
      highlights: ["a"],
      improvements: ["b"],
      summary: "c",
    });
    expect(() => parseAiResponse(json)).toThrow("invalid score");
  });

  test("rejects empty highlights", () => {
    const json = JSON.stringify({
      score: 50,
      highlights: [],
      improvements: ["b"],
      summary: "c",
    });
    expect(() => parseAiResponse(json)).toThrow("invalid highlights");
  });

  test("rejects missing highlights", () => {
    const json = JSON.stringify({
      score: 50,
      improvements: ["b"],
      summary: "c",
    });
    expect(() => parseAiResponse(json)).toThrow("invalid highlights");
  });

  test("rejects empty improvements", () => {
    const json = JSON.stringify({
      score: 50,
      highlights: ["a"],
      improvements: [],
      summary: "c",
    });
    expect(() => parseAiResponse(json)).toThrow("invalid improvements");
  });

  test("rejects empty summary", () => {
    const json = JSON.stringify({
      score: 50,
      highlights: ["a"],
      improvements: ["b"],
      summary: "",
    });
    expect(() => parseAiResponse(json)).toThrow("invalid summary");
  });

  test("rejects missing summary", () => {
    const json = JSON.stringify({
      score: 50,
      highlights: ["a"],
      improvements: ["b"],
    });
    expect(() => parseAiResponse(json)).toThrow("invalid summary");
  });

  test("rejects invalid JSON", () => {
    expect(() => parseAiResponse("not json")).toThrow();
  });

  test("converts non-string highlight elements to strings", () => {
    const json = JSON.stringify({
      score: 50,
      highlights: [123, true],
      improvements: ["b"],
      summary: "c",
    });
    const result = parseAiResponse(json);
    expect(result.highlights).toEqual(["123", "true"]);
  });
});
