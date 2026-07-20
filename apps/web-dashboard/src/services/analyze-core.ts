/**
 * Core AI analysis pipeline.
 *
 * Extracted from the analyze route to be shared by:
 *   1. POST /api/daily/[date]/analyze — manual trigger
 *   2. AutoAnalyzeService — automatic background trigger
 *
 * Pure orchestration: settings → data → prompt → AI call → cache.
 * Returns a discriminated union (never throws for expected errors).
 */

import type { AiSettingsInput } from "@nocoo/next-ai";
import { createAiModel, resolveAiConfig } from "@nocoo/next-ai/server";
import { generateText } from "ai";
import { query } from "@/lib/d1";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { fetchSessionsForDate } from "@/lib/session-queries";
import { settingsRepo } from "@/lib/settings-repo";
import { epochToLocalHHMM } from "@/lib/timezone";
import { computeDailyStats, type DailyStats, type SessionForChart } from "@/services/daily-stats";
import {
  DEFAULT_PROMPT_SECTION_1,
  DEFAULT_PROMPT_SECTION_2,
  DEFAULT_PROMPT_SECTION_3,
  DEFAULT_PROMPT_SECTION_4,
} from "@/services/prompt-defaults";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimeSegment {
  /** e.g. "09:00-11:30" */
  timeRange: string;
  /** Focus label, e.g. "前端开发" or "文档阅读" */
  label: string;
  /** Short description of what happened in this segment */
  description: string;
}

export interface AiAnalysisResult {
  score: number;
  highlights: string[];
  improvements: string[];
  timeSegments: TimeSegment[];
  summary: string;
}

/** Per-app context: category, tags, and user note. */
export interface AppContext {
  bundleId: string;
  categoryTitle?: string;
  tags: string[];
  note?: string;
}

/** Custom prompt sections supplied by the user (all optional). */
export interface CustomPromptSections {
  section1?: string;
  section2?: string;
  section3?: string;
  section4?: string;
}

/** AI settings loaded from the settings table. */
export interface AiSettings {
  provider: string;
  apiKey: string;
  model: string;
  baseURL: string;
  sdkType: string;
  authType: string;
  promptSection1: string;
  promptSection2: string;
  promptSection3: string;
  promptSection4: string;
}

export type AnalysisOutcome =
  | {
      ok: true;
      score: number;
      model: string;
      provider: string;
      durationMs: number;
      result: AiAnalysisResult;
      prompt: string;
      stats: DailyStats;
      usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
    }
  | {
      ok: false;
      reason: "no_ai_config" | "no_sessions" | "ai_error" | "parse_error";
      message: string;
    };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Known idle/system-core bundle IDs that represent idle/lock screen. */
export const IDLE_BUNDLE_IDS = new Set([
  "com.apple.loginwindow",
  "com.apple.ScreenSaver.Engine",
  "com.apple.screenCaptureUI",
]);

/** Known browser bundle IDs. */
export const BROWSER_BUNDLE_IDS = new Set([
  "com.apple.Safari",
  "com.google.Chrome",
  "org.mozilla.firefox",
  "com.microsoft.edgemac",
  "company.thebrowser.Browser",
  "com.brave.Browser",
  "com.operasoftware.Opera",
  "com.vivaldi.Vivaldi",
  "org.chromium.Chromium",
]);

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Load AI settings from the settings table. */
export async function loadAiSettings(userId: string): Promise<AiSettings> {
  const all = await settingsRepo.findByUserId(userId);
  const map = new Map(all.map((s) => [s.key, s.value]));
  return {
    provider: map.get("ai.provider") ?? "",
    apiKey: map.get("ai.apiKey") ?? "",
    model: map.get("ai.model") ?? "",
    baseURL: map.get("ai.baseURL") ?? "",
    sdkType: map.get("ai.sdkType") ?? "",
    authType: map.get("ai.authType") ?? "",
    promptSection1: map.get("ai.prompt.section1") ?? "",
    promptSection2: map.get("ai.prompt.section2") ?? "",
    promptSection3: map.get("ai.prompt.section3") ?? "",
    promptSection4: map.get("ai.prompt.section4") ?? "",
  };
}

/** Load categories, tags, and notes for all apps the user has annotated. */
export async function loadAppContext(userId: string): Promise<Map<string, AppContext>> {
  const [categoryRows, tagRows, noteRows] = await Promise.all([
    query<{ bundle_id: string; title: string }>(
      `SELECT m.bundle_id, c.title
       FROM app_category_mappings m
       JOIN categories c ON c.id = m.category_id
       WHERE m.user_id = ?`,
      [userId],
    ),
    query<{ bundle_id: string; tag_name: string }>(
      `SELECT m.bundle_id, t.name as tag_name
       FROM app_tag_mappings m
       JOIN tags t ON t.id = m.tag_id
       WHERE m.user_id = ?`,
      [userId],
    ),
    query<{ bundle_id: string; note: string }>(
      `SELECT bundle_id, note FROM app_notes WHERE user_id = ?`,
      [userId],
    ),
  ]);

  const map = new Map<string, AppContext>();

  const getOrCreate = (bundleId: string): AppContext => {
    let ctx = map.get(bundleId);
    if (!ctx) {
      ctx = { bundleId, tags: [] };
      map.set(bundleId, ctx);
    }
    return ctx;
  };

  for (const row of categoryRows) {
    getOrCreate(row.bundle_id).categoryTitle = row.title;
  }
  for (const row of tagRows) {
    getOrCreate(row.bundle_id).tags.push(row.tag_name);
  }
  for (const row of noteRows) {
    getOrCreate(row.bundle_id).note = row.note;
  }

  return map;
}

/** Format the app context map into a prompt-friendly string. */
export function buildAppContextSection(
  appContext: Map<string, AppContext>,
  bundleIdsInDay: Set<string>,
): string {
  const relevant: AppContext[] = [];
  for (const bundleId of bundleIdsInDay) {
    const ctx = appContext.get(bundleId);
    if (ctx && (ctx.categoryTitle || ctx.tags.length > 0 || ctx.note)) {
      relevant.push(ctx);
    }
  }

  if (relevant.length === 0) return "";

  const lines = relevant.map((ctx) => {
    const parts: string[] = [`- **${ctx.bundleId}**`];
    if (ctx.categoryTitle) parts.push(`分类: ${ctx.categoryTitle}`);
    if (ctx.tags.length > 0) parts.push(`标签: ${ctx.tags.join(", ")}`);
    if (ctx.note) parts.push(`备注: ${ctx.note}`);
    return parts.join(" | ");
  });

  return `\n## 应用上下文（用户标注）
以下是用户对部分应用的分类、标签和备注说明，请结合这些信息来理解每个应用的用途和性质：

${lines.join("\n")}
`;
}

/** Format seconds to human-readable duration. */
export function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.round(sec / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h${rm}min` : `${h}h`;
}

/**
 * Build a detailed session timeline for the prompt.
 * Groups sessions chronologically, marks idle sessions,
 * and includes browser URLs/titles.
 */
export function buildSessionTimeline(sessions: SessionForChart[], tz: string): string {
  if (sessions.length === 0) return "(no sessions)";

  const sorted = [...sessions].sort((a, b) => a.startTime - b.startTime);
  const lines: string[] = [];

  for (const s of sorted) {
    const time = epochToLocalHHMM(s.startTime, tz);
    const dur = fmtDuration(s.duration);
    const isIdle = s.bundleId ? IDLE_BUNDLE_IDS.has(s.bundleId) : false;
    const isBrowser = s.bundleId ? BROWSER_BUNDLE_IDS.has(s.bundleId) : false;

    let line = `[${time}] ${s.appName} (${dur})`;
    if (isIdle) {
      line += " [IDLE/锁屏]";
    }
    if (s.windowTitle) {
      line += ` — "${s.windowTitle}"`;
    }
    if (isBrowser && s.url) {
      line += ` | URL: ${s.url}`;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Expand {{variable}} placeholders in a template string.
 * Only known keys are expanded; unknown placeholders are left as-is.
 */
export function expandTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key: string) => {
    if (!(key in vars)) {
      return match;
    }
    return vars[key] ?? match;
  });
}

/** Build the analysis prompt from stats data and app context. */
export function buildPrompt(
  date: string,
  stats: DailyStats,
  appContext: Map<string, AppContext>,
  tz: string,
  custom?: CustomPromptSections,
): string {
  const topAppsStr = stats.topApps
    .slice(0, 10)
    .map(
      (a, i) =>
        `${i + 1}. ${a.appName} — ${Math.round(a.totalDuration / 60)}min (${a.sessionCount} sessions)`,
    )
    .join("\n");

  const scores = stats.scores;
  const timeline = buildSessionTimeline(stats.sessions, tz);

  const bundleIdsInDay = new Set<string>();
  for (const s of stats.sessions) {
    if (s.bundleId) bundleIdsInDay.add(s.bundleId);
  }
  const appContextSection = buildAppContextSection(appContext, bundleIdsInDay);

  const idleSessions = stats.sessions.filter((s) => s.bundleId && IDLE_BUNDLE_IDS.has(s.bundleId));
  const idleDuration = idleSessions.reduce((sum, s) => sum + s.duration, 0);
  const idleNote =
    idleDuration > 0
      ? `\n- 闲置/锁屏时间：${Math.round(idleDuration / 60)} 分钟（loginwindow/ScreenSaver 等属于闲置，不应算作有效工作）`
      : "";

  const vars: Record<string, string> = {
    date,
    totalDuration: String(Math.round(stats.totalDuration / 60)),
    totalSessions: String(stats.totalSessions),
    totalApps: String(stats.totalApps),
    activeSpan: String(Math.round(stats.activeSpan / 60)),
    idleNote,
    "scores.focus": String(scores.focus),
    "scores.deepWork": String(scores.deepWork),
    "scores.switchRate": String(scores.switchRate),
    "scores.concentration": String(scores.concentration),
    "scores.overall": String(scores.overall),
    topApps: topAppsStr,
    appContext: appContextSection,
    timeline,
  };

  const s1 = custom?.section1 || DEFAULT_PROMPT_SECTION_1;
  const s2Raw = custom?.section2 || DEFAULT_PROMPT_SECTION_2;
  const s3 = custom?.section3 || DEFAULT_PROMPT_SECTION_3;
  const s4 = custom?.section4 || DEFAULT_PROMPT_SECTION_4;

  const s2 = expandTemplate(s2Raw, vars);

  return [s1, s2, s3, s4].join("\n\n");
}

/** Parse and validate the AI response JSON. */
export function parseAiResponse(text: string): AiAnalysisResult {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
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
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Run AI analysis for a user+date. Never throws for expected errors.
 * Returns a discriminated union so callers can handle each case.
 */
export async function runAnalysis(
  userId: string,
  date: string,
  tz: string,
): Promise<AnalysisOutcome> {
  // 1. Load AI config
  const settings = await loadAiSettings(userId);
  if (!settings.provider || !settings.apiKey) {
    return {
      ok: false,
      reason: "no_ai_config",
      message: "AI provider and API key must be configured first.",
    };
  }

  let config: ReturnType<typeof resolveAiConfig>;
  try {
    const input: AiSettingsInput = {
      provider: settings.provider,
      apiKey: settings.apiKey,
      model: settings.model,
      baseURL: settings.baseURL || undefined,
      sdkType: settings.sdkType ? (settings.sdkType as "anthropic" | "openai") : undefined,
      authType:
        settings.authType === "bearer" || settings.authType === "apiKey"
          ? settings.authType
          : undefined,
    };
    config = resolveAiConfig(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid AI configuration";
    return { ok: false, reason: "no_ai_config", message: msg };
  }

  // 2. Fetch sessions
  const rows = await fetchSessionsForDate(userId, date, tz);
  if (rows.length === 0) {
    return { ok: false, reason: "no_sessions", message: "No sessions found for this date." };
  }

  // 3. Compute stats + load context
  const stats = computeDailyStats(date, rows);
  const appContext = await loadAppContext(userId);

  // 4. Build prompt
  const customSections: CustomPromptSections = {};
  if (settings.promptSection1) customSections.section1 = settings.promptSection1;
  if (settings.promptSection2) customSections.section2 = settings.promptSection2;
  if (settings.promptSection3) customSections.section3 = settings.promptSection3;
  if (settings.promptSection4) customSections.section4 = settings.promptSection4;

  const prompt = buildPrompt(
    date,
    stats,
    appContext,
    tz,
    Object.keys(customSections).length > 0 ? customSections : undefined,
  );

  // 5. Call AI provider (120s timeout — large days can hit 60s+ inference)
  let text: string;
  let usage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined;
  let durationMs: number;

  try {
    const aiModel = createAiModel(config);
    const startMs = Date.now();
    console.log(
      `[analyze-core] AI call starting: provider=${config.provider} model=${config.model} promptChars=${prompt.length} sessions=${stats.sessions.length}`,
    );
    const response = await generateText({
      model: aiModel,
      prompt,
      maxOutputTokens: 4096,
      abortSignal: AbortSignal.timeout(120_000),
    });
    text = response.text;
    usage = response.usage;
    durationMs = Date.now() - startMs;
    console.log(
      `[analyze-core] AI call succeeded: provider=${config.provider} model=${config.model} duration=${durationMs}ms tokens=${usage?.totalTokens ?? "?"}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = err instanceof DOMException && err.name === "TimeoutError";
    console.error(
      `[analyze-core] AI provider error: provider=${config.provider} model=${config.model} timeout=${isTimeout} promptChars=${prompt.length} sessions=${stats.sessions.length} error=${message}`,
    );
    return {
      ok: false,
      reason: "ai_error",
      message: isTimeout
        ? "AI provider timed out. Try again or use a faster model."
        : `AI provider error: ${message}`,
    };
  }

  // 6. Parse AI response
  let result: AiAnalysisResult;
  try {
    result = parseAiResponse(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const preview = text.slice(0, 400).replace(/\s+/g, " ").trim();
    console.error(
      `[analyze-core] Failed to parse AI response: ${message}. Raw text (first 500 chars): ${text.slice(0, 500)}`,
    );
    return {
      ok: false,
      reason: "parse_error",
      message: `Failed to parse AI response: ${message}\n\nModel returned (first 400 chars): ${preview}`,
    };
  }

  // 7. Cache result (non-fatal)
  try {
    await dailySummaryRepo.upsertAiResult(
      userId,
      date,
      result.score,
      JSON.stringify(result),
      config.model,
      prompt,
    );
  } catch (err) {
    console.error(
      `[analyze-core] Failed to cache AI result: ${err instanceof Error ? err.message : err}`,
    );
  }

  return {
    ok: true,
    score: result.score,
    model: config.model,
    provider: config.provider,
    durationMs,
    result,
    prompt,
    stats,
    usage: {
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
    },
  };
}
