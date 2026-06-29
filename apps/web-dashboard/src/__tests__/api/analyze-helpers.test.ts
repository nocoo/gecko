/**
 * Tests for internal helpers in the analyze route.
 * These are exported with _ prefix specifically for testing.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.E2E_SKIP_AUTH = "true";
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  delete process.env.E2E_SKIP_AUTH;
  globalThis.fetch = originalFetch;
});

function mockD1(responses: unknown[][] = [[]]) {
  let callIndex = 0;
  globalThis.fetch = vi.fn((_url: string, _init: RequestInit) => {
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
}

// ---------------------------------------------------------------------------
// validateDate
// ---------------------------------------------------------------------------

describe("validateDate", () => {
  let validateDate: (dateStr: string, tz: string) => string | null;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    validateDate = mod._validateDate;
  });

  test("returns null for valid past date", () => {
    expect(validateDate("2026-01-15", "Asia/Shanghai")).toBeNull();
  });

  test("rejects invalid format", () => {
    expect(validateDate("2026/01/15", "Asia/Shanghai")).toContain("Invalid date format");
    expect(validateDate("20260115", "Asia/Shanghai")).toContain("Invalid date format");
    expect(validateDate("Jan 15", "Asia/Shanghai")).toContain("Invalid date format");
  });

  test("rejects invalid calendar date", () => {
    expect(validateDate("2026-02-30", "Asia/Shanghai")).toContain("Invalid date");
    expect(validateDate("2026-13-01", "Asia/Shanghai")).toContain("Invalid date");
  });

  test("rejects future date", () => {
    expect(validateDate("2099-12-31", "Asia/Shanghai")).toContain("Cannot analyze future");
  });
});

// ---------------------------------------------------------------------------
// fmtDuration
// ---------------------------------------------------------------------------

describe("fmtDuration", () => {
  let fmtDuration: (sec: number) => string;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    fmtDuration = mod._fmtDuration;
  });

  test("formats seconds", () => {
    expect(fmtDuration(30)).toBe("30s");
    expect(fmtDuration(59)).toBe("59s");
  });

  test("formats minutes", () => {
    expect(fmtDuration(60)).toBe("1min");
    expect(fmtDuration(300)).toBe("5min");
    expect(fmtDuration(3540)).toBe("59min");
  });

  test("formats hours", () => {
    expect(fmtDuration(3600)).toBe("1h");
    expect(fmtDuration(7200)).toBe("2h");
  });

  test("formats hours and minutes", () => {
    expect(fmtDuration(5400)).toBe("1h30min");
    expect(fmtDuration(3660)).toBe("1h1min");
  });
});

// ---------------------------------------------------------------------------
// buildSessionTimeline
// ---------------------------------------------------------------------------

describe("buildSessionTimeline", () => {
  let buildSessionTimeline: (sessions: Array<{
    appName: string;
    bundleId: string | null;
    windowTitle: string;
    url: string | null;
    startTime: number;
    duration: number;
  }>, tz: string) => string;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    buildSessionTimeline = mod._buildSessionTimeline as typeof buildSessionTimeline;
  });

  test("returns '(no sessions)' for empty array", () => {
    expect(buildSessionTimeline([], "Asia/Shanghai")).toBe("(no sessions)");
  });

  test("marks idle sessions", () => {
    // 2026-02-27 09:00 CST = 2026-02-27T01:00:00Z
    const epoch = Date.UTC(2026, 1, 27, 1, 0, 0) / 1000;
    const sessions = [
      { appName: "loginwindow", bundleId: "com.apple.loginwindow", windowTitle: "loginwindow", url: null, startTime: epoch, duration: 300, id: "1" },
    ];
    const result = buildSessionTimeline(sessions as never, "Asia/Shanghai");
    expect(result).toContain("[IDLE/锁屏]");
  });

  test("includes browser URL", () => {
    const epoch = Date.UTC(2026, 1, 27, 1, 0, 0) / 1000;
    const sessions = [
      { appName: "Chrome", bundleId: "com.google.Chrome", windowTitle: "GitHub", url: "https://github.com", startTime: epoch, duration: 600, id: "1" },
    ];
    const result = buildSessionTimeline(sessions as never, "Asia/Shanghai");
    expect(result).toContain("https://github.com");
    expect(result).toContain("GitHub");
  });

  test("sorts sessions chronologically", () => {
    const epoch = Date.UTC(2026, 1, 27, 1, 0, 0) / 1000;
    const sessions = [
      { appName: "Slack", bundleId: "com.slack", windowTitle: "", url: null, startTime: epoch + 3600, duration: 300, id: "2" },
      { appName: "VS Code", bundleId: "com.microsoft.vscode", windowTitle: "", url: null, startTime: epoch, duration: 600, id: "1" },
    ];
    const result = buildSessionTimeline(sessions as never, "Asia/Shanghai");
    const lines = result.split("\n");
    expect(lines[0]).toContain("VS Code");
    expect(lines[1]).toContain("Slack");
  });
});

// ---------------------------------------------------------------------------
// buildAppContextSection
// ---------------------------------------------------------------------------

describe("buildAppContextSection", () => {
  let buildAppContextSection: (
    appContext: Map<string, { bundleId: string; categoryTitle?: string; tags: string[]; note?: string }>,
    bundleIdsInDay: Set<string>,
  ) => string;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    buildAppContextSection = mod._buildAppContextSection as typeof buildAppContextSection;
  });

  test("returns empty string when no relevant context", () => {
    const ctx = new Map();
    const ids = new Set(["com.apple.Terminal"]);
    expect(buildAppContextSection(ctx, ids)).toBe("");
  });

  test("returns empty string when context exists but not in day bundle IDs", () => {
    const ctx = new Map([
      ["com.google.Chrome", { bundleId: "com.google.Chrome", categoryTitle: "Browser", tags: [], note: undefined }],
    ]);
    const ids = new Set(["com.apple.Terminal"]);
    expect(buildAppContextSection(ctx, ids)).toBe("");
  });

  test("includes category, tags, and note", () => {
    const ctx = new Map([
      ["com.google.Chrome", {
        bundleId: "com.google.Chrome",
        categoryTitle: "Browser",
        tags: ["work", "research"],
        note: "Primary browser",
      }],
    ]);
    const ids = new Set(["com.google.Chrome"]);
    const result = buildAppContextSection(ctx, ids);
    expect(result).toContain("应用上下文");
    expect(result).toContain("com.google.Chrome");
    expect(result).toContain("分类: Browser");
    expect(result).toContain("标签: work, research");
    expect(result).toContain("备注: Primary browser");
  });

  test("excludes context entries with no useful info", () => {
    const ctx = new Map([
      ["com.apple.Terminal", { bundleId: "com.apple.Terminal", tags: [] }],
    ]);
    const ids = new Set(["com.apple.Terminal"]);
    expect(buildAppContextSection(ctx, ids)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// loadAppContext
// ---------------------------------------------------------------------------

describe("loadAppContext", () => {
  let loadAppContext: (userId: string) => Promise<Map<string, { bundleId: string; categoryTitle?: string; tags: string[]; note?: string }>>;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    loadAppContext = mod._loadAppContext as typeof loadAppContext;
  });

  test("returns empty map when no data", async () => {
    mockD1([[], [], []]);
    const result = await loadAppContext("user-1");
    expect(result.size).toBe(0);
  });

  test("combines categories, tags, and notes for same bundle", async () => {
    mockD1([
      // categories
      [{ bundle_id: "com.google.Chrome", title: "Browser" }],
      // tags
      [{ bundle_id: "com.google.Chrome", tag_name: "work" }, { bundle_id: "com.google.Chrome", tag_name: "research" }],
      // notes
      [{ bundle_id: "com.google.Chrome", note: "Main browser" }],
    ]);
    const result = await loadAppContext("user-1");
    expect(result.size).toBe(1);
    const chrome = result.get("com.google.Chrome")!;
    expect(chrome.categoryTitle).toBe("Browser");
    expect(chrome.tags).toEqual(["work", "research"]);
    expect(chrome.note).toBe("Main browser");
  });

  test("handles multiple different apps", async () => {
    mockD1([
      [{ bundle_id: "com.google.Chrome", title: "Browser" }],
      [{ bundle_id: "com.microsoft.VSCode", tag_name: "dev" }],
      [],
    ]);
    const result = await loadAppContext("user-1");
    expect(result.size).toBe(2);
    expect(result.get("com.google.Chrome")!.categoryTitle).toBe("Browser");
    expect(result.get("com.microsoft.VSCode")!.tags).toEqual(["dev"]);
  });
});

// ---------------------------------------------------------------------------
// loadAiSettings
// ---------------------------------------------------------------------------

describe("loadAiSettings", () => {
  let loadAiSettings: (userId: string) => Promise<{
    provider: string; apiKey: string; model: string; baseURL: string; sdkType: string;
    promptSection1: string; promptSection2: string; promptSection3: string; promptSection4: string;
  }>;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    loadAiSettings = mod._loadAiSettings as typeof loadAiSettings;
  });

  test("returns settings from DB", async () => {
    mockD1([
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 0 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 0 },
        { user_id: "u1", key: "ai.model", value: "claude-sonnet-4-20250514", updated_at: 0 },
      ],
    ]);
    const result = await loadAiSettings("u1");
    expect(result.provider).toBe("anthropic");
    expect(result.apiKey).toBe("sk-test");
    expect(result.model).toBe("claude-sonnet-4-20250514");
    expect(result.baseURL).toBe("");
    expect(result.sdkType).toBe("");
    expect(result.promptSection1).toBe("");
    expect(result.promptSection2).toBe("");
    expect(result.promptSection3).toBe("");
    expect(result.promptSection4).toBe("");
  });

  test("returns empty strings when no settings", async () => {
    mockD1([[]]);
    const result = await loadAiSettings("u1");
    expect(result.provider).toBe("");
    expect(result.apiKey).toBe("");
  });

  test("returns custom prompt sections when stored", async () => {
    mockD1([
      [
        { user_id: "u1", key: "ai.provider", value: "anthropic", updated_at: 0 },
        { user_id: "u1", key: "ai.apiKey", value: "sk-test", updated_at: 0 },
        { user_id: "u1", key: "ai.prompt.section1", value: "Custom role.", updated_at: 0 },
        { user_id: "u1", key: "ai.prompt.section3", value: "Custom rules.", updated_at: 0 },
      ],
    ]);
    const result = await loadAiSettings("u1");
    expect(result.promptSection1).toBe("Custom role.");
    expect(result.promptSection2).toBe("");
    expect(result.promptSection3).toBe("Custom rules.");
    expect(result.promptSection4).toBe("");
  });
});

// ---------------------------------------------------------------------------
// IDLE/BROWSER bundle ID sets
// ---------------------------------------------------------------------------

describe("bundle ID sets", () => {
  let IDLE_BUNDLE_IDS: Set<string>;
  let BROWSER_BUNDLE_IDS: Set<string>;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    IDLE_BUNDLE_IDS = mod._IDLE_BUNDLE_IDS;
    BROWSER_BUNDLE_IDS = mod._BROWSER_BUNDLE_IDS;
  });

  test("IDLE_BUNDLE_IDS contains expected entries", () => {
    expect(IDLE_BUNDLE_IDS.has("com.apple.loginwindow")).toBe(true);
    expect(IDLE_BUNDLE_IDS.has("com.apple.ScreenSaver.Engine")).toBe(true);
    expect(IDLE_BUNDLE_IDS.has("com.apple.screenCaptureUI")).toBe(true);
  });

  test("BROWSER_BUNDLE_IDS contains major browsers", () => {
    expect(BROWSER_BUNDLE_IDS.has("com.apple.Safari")).toBe(true);
    expect(BROWSER_BUNDLE_IDS.has("com.google.Chrome")).toBe(true);
    expect(BROWSER_BUNDLE_IDS.has("org.mozilla.firefox")).toBe(true);
    expect(BROWSER_BUNDLE_IDS.has("com.microsoft.edgemac")).toBe(true);
    expect(BROWSER_BUNDLE_IDS.has("company.thebrowser.Browser")).toBe(true);
    expect(BROWSER_BUNDLE_IDS.has("com.brave.Browser")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseAiResponse
// ---------------------------------------------------------------------------

describe("parseAiResponse", () => {
  let parseAiResponse: (text: string) => {
    score: number;
    highlights: string[];
    improvements: string[];
    timeSegments: Array<{ timeRange: string; label: string; description: string }>;
    summary: string;
  };

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    parseAiResponse = mod._parseAiResponse as typeof parseAiResponse;
  });

  const validResponse = JSON.stringify({
    score: 78,
    highlights: ["Focused coding session", "Good deep work block"],
    improvements: ["Too many context switches"],
    timeSegments: [
      { timeRange: "09:00-12:00", label: "Morning coding", description: "Focused VS Code usage" },
    ],
    summary: "A productive morning with focused coding sessions.",
  });

  test("parses valid JSON response", () => {
    const result = parseAiResponse(validResponse);
    expect(result.score).toBe(78);
    expect(result.highlights).toEqual(["Focused coding session", "Good deep work block"]);
    expect(result.improvements).toEqual(["Too many context switches"]);
    expect(result.timeSegments).toHaveLength(1);
    expect(result.timeSegments[0]!.label).toBe("Morning coding");
    expect(result.summary).toBe("A productive morning with focused coding sessions.");
  });

  test("strips markdown code fences", () => {
    const withFences = "```json\n" + validResponse + "\n```";
    const result = parseAiResponse(withFences);
    expect(result.score).toBe(78);
  });

  test("strips code fences without language tag", () => {
    const withFences = "```\n" + validResponse + "\n```";
    const result = parseAiResponse(withFences);
    expect(result.score).toBe(78);
  });

  test("rounds score to integer", () => {
    const response = JSON.stringify({
      score: 78.6,
      highlights: ["a"],
      improvements: ["b"],
      summary: "good",
    });
    const result = parseAiResponse(response);
    expect(result.score).toBe(79);
  });

  test("throws on invalid score (too low)", () => {
    const response = JSON.stringify({
      score: 0,
      highlights: ["a"],
      improvements: ["b"],
      summary: "bad",
    });
    expect(() => parseAiResponse(response)).toThrow("AI returned invalid score");
  });

  test("throws on invalid score (too high)", () => {
    const response = JSON.stringify({
      score: 101,
      highlights: ["a"],
      improvements: ["b"],
      summary: "bad",
    });
    expect(() => parseAiResponse(response)).toThrow("AI returned invalid score");
  });

  test("throws on non-numeric score", () => {
    const response = JSON.stringify({
      score: "high",
      highlights: ["a"],
      improvements: ["b"],
      summary: "bad",
    });
    expect(() => parseAiResponse(response)).toThrow("AI returned invalid score");
  });

  test("throws on empty highlights", () => {
    const response = JSON.stringify({
      score: 75,
      highlights: [],
      improvements: ["b"],
      summary: "ok",
    });
    expect(() => parseAiResponse(response)).toThrow("AI returned invalid highlights");
  });

  test("throws on missing highlights", () => {
    const response = JSON.stringify({
      score: 75,
      improvements: ["b"],
      summary: "ok",
    });
    expect(() => parseAiResponse(response)).toThrow("AI returned invalid highlights");
  });

  test("throws on empty improvements", () => {
    const response = JSON.stringify({
      score: 75,
      highlights: ["a"],
      improvements: [],
      summary: "ok",
    });
    expect(() => parseAiResponse(response)).toThrow("AI returned invalid improvements");
  });

  test("throws on empty summary", () => {
    const response = JSON.stringify({
      score: 75,
      highlights: ["a"],
      improvements: ["b"],
      summary: "",
    });
    expect(() => parseAiResponse(response)).toThrow("AI returned invalid summary");
  });

  test("throws on non-string summary", () => {
    const response = JSON.stringify({
      score: 75,
      highlights: ["a"],
      improvements: ["b"],
      summary: 42,
    });
    expect(() => parseAiResponse(response)).toThrow("AI returned invalid summary");
  });

  test("throws on invalid JSON", () => {
    expect(() => parseAiResponse("not json at all")).toThrow();
  });

  test("returns empty timeSegments when not provided", () => {
    const response = JSON.stringify({
      score: 75,
      highlights: ["a"],
      improvements: ["b"],
      summary: "ok",
    });
    const result = parseAiResponse(response);
    expect(result.timeSegments).toEqual([]);
  });

  test("filters out timeSegments with missing timeRange or label", () => {
    const response = JSON.stringify({
      score: 75,
      highlights: ["a"],
      improvements: ["b"],
      summary: "ok",
      timeSegments: [
        { timeRange: "09:00-12:00", label: "Morning", description: "work" },
        { timeRange: "", label: "Bad", description: "missing range" },
        { timeRange: "13:00-14:00", label: "", description: "missing label" },
      ],
    });
    const result = parseAiResponse(response);
    expect(result.timeSegments).toHaveLength(1);
    expect(result.timeSegments[0]!.timeRange).toBe("09:00-12:00");
  });
});

// ---------------------------------------------------------------------------
// expandTemplate
// ---------------------------------------------------------------------------

describe("expandTemplate", () => {
  let expandTemplate: (template: string, vars: Record<string, string>) => string;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    expandTemplate = mod._expandTemplate;
  });

  test("replaces simple variables", () => {
    const result = expandTemplate("Hello {{name}}", { name: "World" });
    expect(result).toBe("Hello World");
  });

  test("replaces dotted variables", () => {
    const result = expandTemplate("Score: {{scores.focus}}/100", { "scores.focus": "75" });
    expect(result).toBe("Score: 75/100");
  });

  test("replaces multiple variables", () => {
    const result = expandTemplate("{{a}} and {{b}}", { a: "X", b: "Y" });
    expect(result).toBe("X and Y");
  });

  test("replaces same variable appearing multiple times", () => {
    const result = expandTemplate("{{x}} + {{x}}", { x: "1" });
    expect(result).toBe("1 + 1");
  });

  test("leaves unknown variables as-is", () => {
    const result = expandTemplate("{{known}} and {{unknown}}", { known: "OK" });
    expect(result).toBe("OK and {{unknown}}");
  });

  test("handles empty vars map", () => {
    const result = expandTemplate("{{a}} text", {});
    expect(result).toBe("{{a}} text");
  });

  test("handles template with no variables", () => {
    const result = expandTemplate("plain text", { a: "1" });
    expect(result).toBe("plain text");
  });

  test("handles empty template", () => {
    const result = expandTemplate("", { a: "1" });
    expect(result).toBe("");
  });

  test("handles multiline template", () => {
    const result = expandTemplate("Line1: {{a}}\nLine2: {{b}}", { a: "X", b: "Y" });
    expect(result).toBe("Line1: X\nLine2: Y");
  });

  test("handles variable value with special regex chars", () => {
    const result = expandTemplate("{{url}}", { url: "https://example.com?a=1&b=2" });
    expect(result).toBe("https://example.com?a=1&b=2");
  });
});

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

describe("buildPrompt", () => {
  type CustomPromptSections = import("../../app/api/daily/[date]/analyze/route").CustomPromptSections;
  let buildPrompt: (
    date: string,
    stats: import("../../services/daily-stats").DailyStats,
    appContext: Map<string, { bundleId: string; categoryTitle?: string; tags: string[]; note?: string }>,
    tz: string,
    custom?: CustomPromptSections,
  ) => string;

  beforeEach(async () => {
    const mod = await import("../../app/api/daily/[date]/analyze/route");
    buildPrompt = mod._buildPrompt as typeof buildPrompt;
  });

  function makeStats(overrides?: Partial<import("../../services/daily-stats").DailyStats>): import("../../services/daily-stats").DailyStats {
    return {
      date: "2026-02-27",
      totalDuration: 3600,
      totalSessions: 10,
      totalApps: 5,
      activeSpan: 7200,
      scores: { focus: 70, deepWork: 60, switchRate: 80, concentration: 75, overall: 71 },
      topApps: [
        { appName: "VS Code", bundleId: "com.microsoft.VSCode", totalDuration: 1800, sessionCount: 5 },
        { appName: "Chrome", bundleId: "com.google.Chrome", totalDuration: 900, sessionCount: 3 },
      ],
      sessions: [
        { id: "1", appName: "VS Code", bundleId: "com.microsoft.VSCode", windowTitle: "main.ts", url: null, startTime: 1740600000, duration: 1800 },
        { id: "2", appName: "Chrome", bundleId: "com.google.Chrome", windowTitle: "GitHub", url: "https://github.com", startTime: 1740601800, duration: 900 },
      ],
      ...overrides,
    };
  }

  test("includes date and basic stats in prompt", () => {
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai");
    expect(result).toContain("2026-02-27");
    expect(result).toContain("60 分钟"); // 3600/60
    expect(result).toContain("10"); // totalSessions
    expect(result).toContain("5"); // totalApps
  });

  test("includes scores in prompt", () => {
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai");
    expect(result).toContain("专注度：70/100");
    expect(result).toContain("深度工作：60/100");
    expect(result).toContain("切换频率：80/100");
    expect(result).toContain("集中度：75/100");
    expect(result).toContain("综合评分：71/100");
  });

  test("includes top apps in prompt", () => {
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai");
    expect(result).toContain("VS Code");
    expect(result).toContain("Chrome");
  });

  test("includes idle note when idle sessions present", () => {
    const stats = makeStats({
      sessions: [
        { id: "1", appName: "loginwindow", bundleId: "com.apple.loginwindow", windowTitle: "loginwindow", url: null, startTime: 1740600000, duration: 600 },
        { id: "2", appName: "VS Code", bundleId: "com.microsoft.VSCode", windowTitle: "main.ts", url: null, startTime: 1740600600, duration: 1800 },
      ],
    });
    const result = buildPrompt("2026-02-27", stats, new Map(), "Asia/Shanghai");
    expect(result).toContain("闲置/锁屏时间：10 分钟");
  });

  test("omits idle note when no idle sessions", () => {
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai");
    expect(result).not.toContain("闲置/锁屏时间");
  });

  test("includes app context section when relevant", () => {
    const ctx = new Map([
      ["com.microsoft.VSCode", { bundleId: "com.microsoft.VSCode", categoryTitle: "IDE", tags: ["dev"], note: "Main editor" }],
    ]);
    const result = buildPrompt("2026-02-27", makeStats(), ctx, "Asia/Shanghai");
    expect(result).toContain("应用上下文");
    expect(result).toContain("Main editor");
  });

  test("returns a non-empty string with JSON format instructions", () => {
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai");
    expect(result).toContain("JSON");
    expect(result.length).toBeGreaterThan(100);
  });

  // --- Custom prompt sections tests ---

  test("uses custom section1 when provided", () => {
    const custom = { section1: "You are a custom analyst." };
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", custom);
    expect(result).toContain("You are a custom analyst.");
    expect(result).not.toContain("你是一位专业的生产力分析师");
  });

  test("uses custom section2 with template expansion", () => {
    const custom = { section2: "Date: {{date}}, Apps: {{totalApps}}" };
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", custom);
    expect(result).toContain("Date: 2026-02-27, Apps: 5");
    // Should NOT contain default section 2 content
    expect(result).not.toContain("数据概览");
  });

  test("uses custom section3 when provided", () => {
    const custom = { section3: "Custom analysis rules here." };
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", custom);
    expect(result).toContain("Custom analysis rules here.");
    expect(result).not.toContain("loginwindow / ScreenSaver 等闲置进程");
  });

  test("uses custom section4 when provided", () => {
    const custom = { section4: "Return a simple text summary." };
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", custom);
    expect(result).toContain("Return a simple text summary.");
    expect(result).not.toContain("**只**返回 JSON");
  });

  test("mixes custom and default sections", () => {
    const custom = { section1: "Custom role.", section3: "Custom rules." };
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", custom);
    // Custom sections
    expect(result).toContain("Custom role.");
    expect(result).toContain("Custom rules.");
    // Default sections (section2 and section4 should remain default)
    expect(result).toContain("60 分钟"); // default section2 expanded
    expect(result).toContain("**只**返回 JSON"); // default section4
  });

  test("falls back to defaults when custom sections are empty strings", () => {
    const custom = { section1: "", section2: "" };
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", custom);
    // Should use defaults since empty strings are falsy
    expect(result).toContain("你是一位专业的生产力分析师");
    expect(result).toContain("60 分钟");
  });

  test("custom section2 expands all score variables", () => {
    const custom = { section2: "F:{{scores.focus}} D:{{scores.deepWork}} S:{{scores.switchRate}} C:{{scores.concentration}} O:{{scores.overall}}" };
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", custom);
    expect(result).toContain("F:70 D:60 S:80 C:75 O:71");
  });

  test("custom section2 unknown variables are left as-is", () => {
    const custom = { section2: "{{date}} and {{unknownVar}}" };
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", custom);
    expect(result).toContain("2026-02-27 and {{unknownVar}}");
  });

  test("uses default when custom is undefined", () => {
    const result = buildPrompt("2026-02-27", makeStats(), new Map(), "Asia/Shanghai", undefined);
    expect(result).toContain("你是一位专业的生产力分析师");
    expect(result).toContain("**只**返回 JSON");
  });
});
