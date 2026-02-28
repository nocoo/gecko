/**
 * Unit tests for the daily analyze API helpers.
 *
 * Tests parseAiResponse (re-implemented inline since Next.js route
 * modules are awkward to import in unit tests).
 */

import { describe, test, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Types (mirrored from route)
// ---------------------------------------------------------------------------

interface TimeSegment {
  timeRange: string;
  label: string;
  description: string;
}

interface AiAnalysisResult {
  score: number;
  highlights: string[];
  improvements: string[];
  timeSegments: TimeSegment[];
  summary: string;
}

// ---------------------------------------------------------------------------
// parseAiResponse (mirrored from route)
// ---------------------------------------------------------------------------

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

  let timeSegments: TimeSegment[] = [];
  if (Array.isArray(parsed.timeSegments) && parsed.timeSegments.length > 0) {
    timeSegments = (parsed.timeSegments as Record<string, unknown>[])
      .map((seg) => ({
        timeRange: String(seg.timeRange ?? ""),
        label: String(seg.label ?? ""),
        description: String(seg.description ?? ""),
      }))
      .filter((seg) => seg.timeRange && seg.label);
  }

  return {
    score: Math.round(score),
    highlights: highlights.map(String),
    improvements: improvements.map(String),
    timeSegments,
    summary: String(summary),
  };
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const validJson = JSON.stringify({
  score: 72,
  highlights: ["专注度高", "深度工作时间长"],
  improvements: ["减少应用切换", "增加休息时间"],
  timeSegments: [
    { timeRange: "09:00-11:30", label: "前端开发", description: "集中在 VS Code 编写 React 组件" },
    { timeRange: "11:30-12:00", label: "文档阅读", description: "浏览 MDN 和 React 文档" },
    { timeRange: "13:00-15:00", label: "后端开发", description: "API 开发和数据库调试" },
  ],
  summary: "今日整体表现良好，专注度评分达到72分。",
});

const validJsonNoSegments = JSON.stringify({
  score: 72,
  highlights: ["专注度高", "深度工作时间长"],
  improvements: ["减少应用切换", "增加休息时间"],
  summary: "今日整体表现良好。",
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseAiResponse", () => {
  test("parses valid JSON response with timeSegments", () => {
    const result = parseAiResponse(validJson);
    expect(result.score).toBe(72);
    expect(result.highlights).toEqual(["专注度高", "深度工作时间长"]);
    expect(result.improvements).toEqual(["减少应用切换", "增加休息时间"]);
    expect(result.timeSegments).toHaveLength(3);
    expect(result.timeSegments[0]!.timeRange).toBe("09:00-11:30");
    expect(result.timeSegments[0]!.label).toBe("前端开发");
    expect(result.timeSegments[0]!.description).toContain("VS Code");
    expect(result.summary).toBe("今日整体表现良好，专注度评分达到72分。");
  });

  test("handles missing timeSegments gracefully (backward compat)", () => {
    const result = parseAiResponse(validJsonNoSegments);
    expect(result.score).toBe(72);
    expect(result.timeSegments).toEqual([]);
    expect(result.summary).toBe("今日整体表现良好。");
  });

  test("filters out timeSegments with missing timeRange or label", () => {
    const json = JSON.stringify({
      score: 50,
      highlights: ["a"],
      improvements: ["b"],
      timeSegments: [
        { timeRange: "09:00-10:00", label: "工作", description: "good" },
        { timeRange: "", label: "空", description: "bad" },
        { timeRange: "10:00-11:00", label: "", description: "bad" },
        { label: "no range", description: "bad" },
      ],
      summary: "ok",
    });
    const result = parseAiResponse(json);
    expect(result.timeSegments).toHaveLength(1);
    expect(result.timeSegments[0]!.label).toBe("工作");
  });

  test("handles empty timeSegments array", () => {
    const json = JSON.stringify({
      score: 50,
      highlights: ["a"],
      improvements: ["b"],
      timeSegments: [],
      summary: "ok",
    });
    const result = parseAiResponse(json);
    expect(result.timeSegments).toEqual([]);
  });

  test("strips markdown code fences", () => {
    const wrapped = `\`\`\`json\n${validJson}\n\`\`\``;
    const result = parseAiResponse(wrapped);
    expect(result.score).toBe(72);
    expect(result.highlights).toHaveLength(2);
    expect(result.timeSegments).toHaveLength(3);
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
