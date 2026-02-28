/**
 * POST /api/daily/[date]/analyze — Generate AI analysis for a specific date.
 *
 * Requires AI settings to be configured (provider + apiKey in settings).
 * Sends stats + session data to LLM, expects structured JSON response
 * with score, highlights, improvements, and summary (Chinese).
 * Caches the result in daily_summaries.
 */

import { requireSession, jsonOk, jsonError } from "@/lib/api-helpers";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { settingsRepo } from "@/lib/settings-repo";
import {
  resolveAiConfig,
  createAiClient,
  type AiProvider,
  type SdkType,
} from "@/services/ai";
import { generateText } from "ai";
import type { DailyStats } from "@/services/daily-stats";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AiAnalysisResult {
  score: number;
  highlights: string[];
  improvements: string[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(dateStr: string): string | null {
  if (!DATE_RE.test(dateStr)) {
    return "Invalid date format. Use YYYY-MM-DD.";
  }
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return "Invalid date.";
  }
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (dateStr >= todayStr) {
    return "Cannot analyze today or future dates.";
  }
  return null;
}

/** Load AI settings from the settings table. */
async function loadAiSettings(userId: string) {
  const all = await settingsRepo.findByUserId(userId);
  const map = new Map(all.map((s) => [s.key, s.value]));
  return {
    provider: map.get("ai.provider") ?? "",
    apiKey: map.get("ai.apiKey") ?? "",
    model: map.get("ai.model") ?? "",
    baseURL: map.get("ai.baseURL") ?? "",
    sdkType: map.get("ai.sdkType") ?? "",
  };
}

/** Build the analysis prompt from stats data. */
function buildPrompt(date: string, stats: DailyStats): string {
  const topAppsStr = stats.topApps
    .slice(0, 10)
    .map(
      (a, i) =>
        `${i + 1}. ${a.appName} — ${Math.round(a.totalDuration / 60)}min (${a.sessionCount} sessions)`,
    )
    .join("\n");

  const scores = stats.scores;

  return `你是一位专业的生产力分析师。请根据以下用户 ${date} 的电脑使用数据，给出分析报告。

## 数据概览
- 总活跃时长：${Math.round(stats.totalDuration / 60)} 分钟
- 总会话数：${stats.totalSessions}
- 使用应用数：${stats.totalApps}
- 活跃时间跨度：${Math.round(stats.activeSpan / 60)} 分钟

## 评分（规则计算）
- 专注度：${scores.focus}/100
- 深度工作：${scores.deepWork}/100
- 切换频率：${scores.switchRate}/100
- 集中度：${scores.concentration}/100
- 综合评分：${scores.overall}/100

## Top 应用
${topAppsStr}

## 要求
请以 JSON 格式返回分析结果，包含以下字段：
- score: 你给出的综合评分（1-100整数）
- highlights: 今日亮点（字符串数组，2-4条，中文）
- improvements: 改进建议（字符串数组，2-4条，中文）
- summary: 总结（Markdown 格式，中文，200-400字）

只返回 JSON，不要包含其他内容。不要使用 markdown 代码块包裹。`;
}

/** Parse and validate the AI response JSON. */
function parseAiResponse(text: string): AiAnalysisResult {
  // Strip markdown code fences if present
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

  return {
    score: Math.round(score),
    highlights: highlights.map(String),
    improvements: improvements.map(String),
    summary: String(summary),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ date: string }> },
): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const { date } = await params;
  const validationError = validateDate(date);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  // Check if we already have cached stats
  const cached = await dailySummaryRepo.findByUserAndDate(user.userId, date);
  if (!cached?.stats_json || cached.stats_json === "{}") {
    return jsonError(
      "No stats available for this date. Fetch GET /api/daily/:date first.",
      400,
    );
  }

  // Check if AI result already exists
  if (cached.ai_result_json) {
    return jsonOk({
      score: cached.ai_score,
      result: JSON.parse(cached.ai_result_json) as AiAnalysisResult,
      model: cached.ai_model,
      generatedAt: cached.ai_generated_at,
      cached: true,
    });
  }

  // Load AI config
  const settings = await loadAiSettings(user.userId);
  if (!settings.provider || !settings.apiKey) {
    return jsonError("AI provider and API key must be configured first.", 400);
  }

  let config;
  try {
    config = resolveAiConfig({
      provider: settings.provider as AiProvider,
      apiKey: settings.apiKey,
      model: settings.model,
      baseURL: settings.baseURL || undefined,
      sdkType: (settings.sdkType || undefined) as SdkType | undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid AI configuration";
    return jsonError(msg, 400);
  }

  // Generate AI analysis
  const stats = JSON.parse(cached.stats_json) as DailyStats;
  const prompt = buildPrompt(date, stats);

  try {
    const client = createAiClient(config);
    const { text } = await generateText({
      model: client(config.model),
      prompt,
      maxOutputTokens: 2048,
    });

    const result = parseAiResponse(text);

    // Cache result
    await dailySummaryRepo.upsertAiResult(
      user.userId,
      date,
      result.score,
      JSON.stringify(result),
      config.model,
    );

    return jsonOk({
      score: result.score,
      result,
      model: config.model,
      generatedAt: new Date().toISOString(),
      cached: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI analysis failed";
    return jsonError(message, 502);
  }
}
