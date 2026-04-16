/**
 * Tests for services/analyze-core.ts — AI analysis pipeline.
 *
 * Uses D1 mock pattern (globalThis.fetch) for database calls and
 * bun:test mock() for the `ai` module's generateText.
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  loadAiSettings,
  loadAppContext,
  buildPrompt,
  buildSessionTimeline,
  buildAppContextSection,
  fmtDuration,
  expandTemplate,
  parseAiResponse,
  runAnalysis,
  type AppContext,
} from "@/services/analyze-core";
import { computeDailyStats } from "@/services/daily-stats";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// D1 mock helper
// ---------------------------------------------------------------------------

function mockD1(responses: unknown[][] = [[]]) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = mock((_url: string, init: RequestInit) => {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(init.body as string);
    } catch {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Invalid JSON response" }), { status: 400 }),
      );
    }

    if (!body.sql) {
      return Promise.resolve(
        new Response(JSON.stringify({ error: "Invalid JSON response" }), { status: 400 }),
      );
    }

    calls.push({ sql: body.sql as string, params: body.params as unknown[] });

    const results = responses[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

// ---------------------------------------------------------------------------
// Pure function tests
// ---------------------------------------------------------------------------

describe("fmtDuration", () => {
  test("formats seconds", () => {
    expect(fmtDuration(30)).toBe("30s");
  });

  test("formats minutes", () => {
    expect(fmtDuration(300)).toBe("5min");
  });

  test("formats hours", () => {
    expect(fmtDuration(3600)).toBe("1h");
  });

  test("formats hours + minutes", () => {
    expect(fmtDuration(5400)).toBe("1h30min");
  });
});

describe("expandTemplate", () => {
  test("expands known variables", () => {
    expect(expandTemplate("Hello {{name}}", { name: "World" })).toBe("Hello World");
  });

  test("leaves unknown placeholders as-is", () => {
    expect(expandTemplate("{{known}} {{unknown}}", { known: "yes" })).toBe("yes {{unknown}}");
  });

  test("handles dotted keys", () => {
    expect(expandTemplate("{{scores.focus}}", { "scores.focus": "80" })).toBe("80");
  });
});

describe("parseAiResponse", () => {
  const validJson = JSON.stringify({
    score: 72,
    highlights: ["Good focus"],
    improvements: ["Take breaks"],
    timeSegments: [{ timeRange: "09:00-11:00", label: "Dev", description: "Coding" }],
    summary: "Good day.",
  });

  test("parses valid JSON", () => {
    const result = parseAiResponse(validJson);
    expect(result.score).toBe(72);
    expect(result.highlights).toEqual(["Good focus"]);
    expect(result.timeSegments).toHaveLength(1);
  });

  test("strips markdown code fences", () => {
    const wrapped = `\`\`\`json\n${validJson}\n\`\`\``;
    const result = parseAiResponse(wrapped);
    expect(result.score).toBe(72);
  });

  test("rejects invalid score", () => {
    const json = JSON.stringify({ score: 0, highlights: ["a"], improvements: ["b"], summary: "c" });
    expect(() => parseAiResponse(json)).toThrow("invalid score");
  });

  test("rejects score > 100", () => {
    const json = JSON.stringify({ score: 101, highlights: ["a"], improvements: ["b"], summary: "c" });
    expect(() => parseAiResponse(json)).toThrow("invalid score");
  });

  test("rejects empty highlights", () => {
    const json = JSON.stringify({ score: 50, highlights: [], improvements: ["b"], summary: "c" });
    expect(() => parseAiResponse(json)).toThrow("invalid highlights");
  });

  test("rejects empty improvements", () => {
    const json = JSON.stringify({ score: 50, highlights: ["a"], improvements: [], summary: "c" });
    expect(() => parseAiResponse(json)).toThrow("invalid improvements");
  });

  test("rejects empty summary", () => {
    const json = JSON.stringify({ score: 50, highlights: ["a"], improvements: ["b"], summary: "" });
    expect(() => parseAiResponse(json)).toThrow("invalid summary");
  });
});

describe("buildSessionTimeline", () => {
  // 2026-03-01 10:00 CST = epoch 1772330400
  const EPOCH_10AM = 1772330400;

  test("returns '(no sessions)' for empty input", () => {
    expect(buildSessionTimeline([], "Asia/Shanghai")).toBe("(no sessions)");
  });

  test("marks idle sessions", () => {
    const sessions = [{
      id: "1", appName: "loginwindow", bundleId: "com.apple.loginwindow",
      windowTitle: "", url: null, startTime: EPOCH_10AM, duration: 600,
    }];
    const result = buildSessionTimeline(sessions, "Asia/Shanghai");
    expect(result).toContain("[IDLE/锁屏]");
  });

  test("includes browser URLs", () => {
    const sessions = [{
      id: "1", appName: "Chrome", bundleId: "com.google.Chrome",
      windowTitle: "Google", url: "https://google.com", startTime: EPOCH_10AM, duration: 300,
    }];
    const result = buildSessionTimeline(sessions, "Asia/Shanghai");
    expect(result).toContain("URL: https://google.com");
  });
});

describe("buildAppContextSection", () => {
  test("returns empty string when no relevant apps", () => {
    const appContext = new Map<string, AppContext>();
    expect(buildAppContextSection(appContext, new Set(["com.foo"]))).toBe("");
  });

  test("includes category, tags, and note", () => {
    const appContext = new Map<string, AppContext>();
    appContext.set("com.foo", {
      bundleId: "com.foo",
      categoryTitle: "开发工具",
      tags: ["work", "coding"],
      note: "Main editor",
    });
    const result = buildAppContextSection(appContext, new Set(["com.foo"]));
    expect(result).toContain("com.foo");
    expect(result).toContain("开发工具");
    expect(result).toContain("work, coding");
    expect(result).toContain("Main editor");
  });
});

describe("buildPrompt", () => {
  // 2026-03-01 10:00 CST = epoch 1772330400
  const EPOCH_10AM = 1772330400;

  test("produces a non-empty prompt string", () => {
    const stats = computeDailyStats("2026-03-01", [
      { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: EPOCH_10AM, duration: 3600 },
    ]);
    const appContext = new Map<string, AppContext>();
    const prompt = buildPrompt("2026-03-01", stats, appContext, "Asia/Shanghai");
    expect(prompt.length).toBeGreaterThan(100);
    expect(prompt).toContain("2026-03-01");
    expect(prompt).toContain("VSCode");
  });

  test("uses custom sections when provided", () => {
    const stats = computeDailyStats("2026-03-01", [
      { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: EPOCH_10AM, duration: 3600 },
    ]);
    const appContext = new Map<string, AppContext>();
    const prompt = buildPrompt("2026-03-01", stats, appContext, "Asia/Shanghai", {
      section1: "Custom role section",
    });
    expect(prompt).toContain("Custom role section");
  });
});

// ---------------------------------------------------------------------------
// loadAiSettings (D1 integration)
// ---------------------------------------------------------------------------

describe("loadAiSettings", () => {
  test("returns settings map from DB rows", async () => {
    mockD1([
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 100 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 100 },
        { user_id: "u1", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: 100 },
      ],
    ]);

    const settings = await loadAiSettings("u1");
    expect(settings.provider).toBe("anthropic");
    expect(settings.apiKey).toBe("sk-test");
    expect(settings.model).toBe("claude-sonnet-4-20250514");
  });

  test("returns empty strings for missing settings", async () => {
    mockD1([[]]);

    const settings = await loadAiSettings("u1");
    expect(settings.provider).toBe("");
    expect(settings.apiKey).toBe("");
  });
});

// ---------------------------------------------------------------------------
// loadAppContext (D1 integration)
// ---------------------------------------------------------------------------

describe("loadAppContext", () => {
  test("merges categories, tags, and notes by bundleId", async () => {
    mockD1([
      // categories
      [{ bundle_id: "com.foo", title: "Dev Tools" }],
      // tags
      [{ bundle_id: "com.foo", tag_name: "work" }],
      // notes
      [{ bundle_id: "com.foo", note: "Main editor" }],
    ]);

    const ctx = await loadAppContext("u1");
    const foo = ctx.get("com.foo");
    expect(foo).toBeDefined();
    expect(foo!.categoryTitle).toBe("Dev Tools");
    expect(foo!.tags).toEqual(["work"]);
    expect(foo!.note).toBe("Main editor");
  });

  test("returns empty map when no context exists", async () => {
    mockD1([[], [], []]);

    const ctx = await loadAppContext("u1");
    expect(ctx.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// runAnalysis (integration — orchestrator)
// ---------------------------------------------------------------------------

describe("runAnalysis", () => {
  // 2026-03-01 10:00 CST = epoch 1772330400 (within Asia/Shanghai day bounds)
  const MARCH_01_10AM_CST = 1772330400;

  test("returns no_ai_config when provider is missing", async () => {
    mockD1([
      // loadAiSettings → empty
      [],
    ]);

    const result = await runAnalysis("u1", "2026-03-01", "Asia/Shanghai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_ai_config");
    }
  });

  test("returns no_sessions when no data for date", async () => {
    mockD1([
      // loadAiSettings
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 100 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 100 },
        { user_id: "u1", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: 100 },
      ],
      // fetchSessionsForDate → empty
      [],
    ]);

    const result = await runAnalysis("u1", "2026-03-01", "Asia/Shanghai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_sessions");
    }
  });

  test("returns no_ai_config when resolveAiConfig throws", async () => {
    const { __testOverrides } = await import("../preload");
    __testOverrides.resolveAiConfig = () => {
      throw new Error("Unsupported provider: badprovider");
    };

    mockD1([
      // loadAiSettings — has provider+apiKey so we pass the first check
      [
        { user_id: "u1", key: "ai.provider", value: "badprovider", updated_at: 100 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 100 },
        { user_id: "u1", key: "ai.model", value: "some-model", updated_at: 100 },
      ],
    ]);

    const result = await runAnalysis("u1", "2026-03-01", "Asia/Shanghai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_ai_config");
      expect(result.message).toContain("Unsupported provider");
    }

    __testOverrides.resolveAiConfig = null;
  });

  test("returns parse_error when AI response is unparseable", async () => {
    const { __testOverrides } = await import("../preload");
    __testOverrides.generateText = async () => ({
      text: "This is not valid JSON at all",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    mockD1([
      // 1. loadAiSettings
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 100 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 100 },
        { user_id: "u1", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: 100 },
      ],
      // 2. fetchSessionsForDate
      [
        { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: MARCH_01_10AM_CST, duration: 3600 },
      ],
      // 3-5. loadAppContext
      [], [], [],
    ]);

    const result = await runAnalysis("u1", "2026-03-01", "Asia/Shanghai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("parse_error");
    }

    __testOverrides.generateText = null;
  });

  test("returns success and caches result on valid AI response", async () => {
    const validResult = {
      score: 72,
      highlights: ["Good focus"],
      improvements: ["Take breaks"],
      timeSegments: [{ timeRange: "09:00-11:00", label: "Dev", description: "Coding" }],
      summary: "Good day.",
    };

    const { __testOverrides } = await import("../preload");
    __testOverrides.generateText = async () => ({
      text: JSON.stringify(validResult),
      usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
    });

    const { calls } = mockD1([
      // 1. loadAiSettings
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 100 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 100 },
        { user_id: "u1", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: 100 },
      ],
      // 2. fetchSessionsForDate
      [
        { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: MARCH_01_10AM_CST, duration: 3600 },
      ],
      // 3-5. loadAppContext
      [], [], [],
      // 6. dailySummaryRepo.upsertAiResult
      [],
    ]);

    const result = await runAnalysis("u1", "2026-03-01", "Asia/Shanghai");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(72);
      expect(result.model).toBe("claude-sonnet-4-20250514");
      expect(result.provider).toBe("anthropic");
      expect(result.result.summary).toBe("Good day.");
      expect(result.usage!.totalTokens).toBe(300);
      expect(typeof result.durationMs).toBe("number");
    }

    // Verify cache write happened
    const upsertQuery = calls.find((c) => c.sql.includes("INSERT") || c.sql.includes("REPLACE"));
    expect(upsertQuery).toBeDefined();

    __testOverrides.generateText = null;
  });

  test("succeeds even when cache upsert fails (non-fatal)", async () => {
    const validResult = {
      score: 80,
      highlights: ["Productive"],
      improvements: ["Rest more"],
      timeSegments: [],
      summary: "Solid day.",
    };

    const { __testOverrides } = await import("../preload");
    __testOverrides.generateText = async () => ({
      text: JSON.stringify(validResult),
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    });

    // D1 mock: upsert call will fail
    let callIndex = 0;
    const responses: unknown[][] = [
      // 1. loadAiSettings
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 100 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 100 },
        { user_id: "u1", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: 100 },
      ],
      // 2. fetchSessionsForDate
      [
        { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: MARCH_01_10AM_CST, duration: 3600 },
      ],
      // 3-5. loadAppContext
      [], [], [],
    ];

    globalThis.fetch = mock((_url: string, init: RequestInit) => {
      let body: Record<string, unknown>;
      try { body = JSON.parse(init.body as string); } catch {
        return Promise.resolve(new Response(JSON.stringify({ error: "bad" }), { status: 400 }));
      }
      if (!body.sql) {
        return Promise.resolve(new Response(JSON.stringify({ error: "bad" }), { status: 400 }));
      }

      const results = responses[callIndex] ?? [];
      callIndex++;

      // 6th call is the upsert — make it fail
      if (callIndex > responses.length) {
        return Promise.resolve(new Response(JSON.stringify({ error: "D1 write failed" }), { status: 500 }));
      }

      return Promise.resolve(
        new Response(JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
          errors: [],
        }), { status: 200 }),
      );
    }) as unknown as typeof fetch;

    const result = await runAnalysis("u1", "2026-03-01", "Asia/Shanghai");
    // Should still succeed despite cache failure
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.score).toBe(80);
    }

    __testOverrides.generateText = null;
  });

  test("returns ai_error with timeout message for DOMException TimeoutError", async () => {
    const { __testOverrides } = await import("../preload");
    __testOverrides.generateText = async () => {
      const err = new DOMException("The operation was aborted.", "TimeoutError");
      throw err;
    };

    mockD1([
      // 1. loadAiSettings
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 100 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 100 },
        { user_id: "u1", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: 100 },
      ],
      // 2. fetchSessionsForDate
      [
        { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: MARCH_01_10AM_CST, duration: 3600 },
      ],
      // 3-5. loadAppContext
      [], [], [],
    ]);

    const result = await runAnalysis("u1", "2026-03-01", "Asia/Shanghai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ai_error");
      expect(result.message).toContain("timed out");
    }

    __testOverrides.generateText = null;
  });

  test("returns ai_error when AI provider call fails", async () => {
    mockD1([
      // 1. loadAiSettings
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 100 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 100 },
        { user_id: "u1", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: 100 },
      ],
      // 2. fetchSessionsForDate — use valid epoch within day bounds
      [
        { id: "s1", app_name: "VSCode", bundle_id: "com.microsoft.VSCode", window_title: "test.ts", url: null, start_time: MARCH_01_10AM_CST, duration: 3600 },
      ],
      // 3-5. loadAppContext — categories, tags, notes
      [],
      [],
      [],
    ]);

    // globalThis.fetch is mocked for D1. generateText will call the AI SDK
    // which will fail because the mock rejects non-SQL requests.
    const result = await runAnalysis("u1", "2026-03-01", "Asia/Shanghai");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("ai_error");
    }
  });
});
