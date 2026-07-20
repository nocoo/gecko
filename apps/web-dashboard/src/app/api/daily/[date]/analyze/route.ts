/**
 * POST /api/daily/[date]/analyze — Generate AI analysis for a specific date.
 *
 * Thin HTTP wrapper around the analyze-core pipeline.
 * Handles: auth, date validation, force flag, cache check, HTTP response mapping.
 */

import { getUserTimezone, jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { ensureAutoAnalyze } from "@/lib/auto-analyze";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { settingsRepo } from "@/lib/settings-repo";
import { todayInTz } from "@/lib/timezone";
import {
  type AiAnalysisResult,
  type AppContext,
  BROWSER_BUNDLE_IDS,
  buildAppContextSection,
  buildPrompt,
  buildSessionTimeline,
  type CustomPromptSections,
  expandTemplate,
  fmtDuration,
  IDLE_BUNDLE_IDS,
  loadAiSettings,
  loadAppContext,
  parseAiResponse,
  runAnalysis,
  type TimeSegment,
} from "@/services/analyze-core";
import { sendAnalysisEmail } from "@/services/email-notification";

// Wire up the hourly auto-analyze scheduler once at module load time.
// This must live in a route module (not instrumentation.ts) because vinext
// production builds only bundle route modules — instrumentation.ts is only
// loaded by the Vite dev server, not by `vinext start`.
ensureAutoAnalyze();

export const dynamic = "force-dynamic";

// Re-export prompt defaults (some modules import them from this path)
export {
  DEFAULT_PROMPT_SECTION_1,
  DEFAULT_PROMPT_SECTION_2,
  DEFAULT_PROMPT_SECTION_3,
  DEFAULT_PROMPT_SECTION_4,
  PROMPT_TEMPLATE_VARIABLES,
} from "@/services/prompt-defaults";
// Re-export types for consumer modules (client components, preview-prompt route)
export type { AiAnalysisResult, AppContext, CustomPromptSections, TimeSegment };

// ---------------------------------------------------------------------------
// Internal helpers (kept here — HTTP-only concerns)
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(dateStr: string, tz: string): string | null {
  if (!DATE_RE.test(dateStr)) {
    return "Invalid date format. Use YYYY-MM-DD.";
  }
  const parts = dateStr.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined) {
    return "Invalid date.";
  }
  const test = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(test.getTime()) ||
    test.getUTCFullYear() !== y ||
    test.getUTCMonth() !== m - 1 ||
    test.getUTCDate() !== d
  ) {
    return "Invalid date.";
  }
  const today = todayInTz(tz);
  if (dateStr > today) {
    return "Cannot analyze future dates.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Underscore-prefixed exports for testing & preview-prompt route
// ---------------------------------------------------------------------------

export type { AppContext as _AppContext };
export {
  BROWSER_BUNDLE_IDS as _BROWSER_BUNDLE_IDS,
  buildAppContextSection as _buildAppContextSection,
  buildPrompt as _buildPrompt,
  buildSessionTimeline as _buildSessionTimeline,
  expandTemplate as _expandTemplate,
  fmtDuration as _fmtDuration,
  IDLE_BUNDLE_IDS as _IDLE_BUNDLE_IDS,
  loadAiSettings as _loadAiSettings,
  loadAppContext as _loadAppContext,
  parseAiResponse as _parseAiResponse,
  validateDate as _validateDate,
};

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(
  req: Request,
  { params }: { params: Promise<{ date: string }> },
): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const tz = await getUserTimezone(user.userId);

  const { date } = await params;
  const validationError = validateDate(date, tz);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  // Support ?force=true to skip cache and regenerate
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true";

  // Check if AI result already exists (skip if force=true)
  if (!force) {
    const cached = await dailySummaryRepo.findByUserAndDate(user.userId, date);
    if (cached?.ai_result_json) {
      return jsonOk({
        score: cached.ai_score,
        result: JSON.parse(cached.ai_result_json) as AiAnalysisResult,
        model: cached.ai_model,
        generatedAt: cached.ai_generated_at,
        cached: true,
        prompt: cached.ai_prompt ?? null,
        usage: null,
        durationMs: null,
      });
    }
  }

  // Delegate to analyze-core pipeline
  const outcome = await runAnalysis(user.userId, date, tz);

  if (!outcome.ok) {
    // Map reason to HTTP status codes
    switch (outcome.reason) {
      case "no_ai_config":
        return jsonError(outcome.message, 400);
      case "no_sessions":
        return jsonError(outcome.message, 400);
      case "ai_error": {
        const isTimeout = outcome.message.includes("timed out");
        return jsonError(outcome.message, isTimeout ? 504 : 502);
      }
      case "parse_error":
        return jsonError(outcome.message, 502);
    }
  }

  // Optional: send email notification for manual analysis (user must opt-in)
  const onManual = await settingsRepo.findByKey(user.userId, "notification.email.onManualAnalyze");
  if (onManual?.value === "true") {
    sendAnalysisEmail({
      userId: user.userId,
      date,
      result: outcome.result,
      stats: outcome.stats,
    }).catch(() => {
      // fire-and-forget; sendAnalysisEmail already handles errors
    });
  }

  return jsonOk({
    score: outcome.score,
    result: outcome.result,
    model: outcome.model,
    provider: outcome.provider,
    generatedAt: new Date().toISOString(),
    cached: false,
    prompt: outcome.prompt,
    usage: outcome.usage ?? null,
    durationMs: outcome.durationMs,
  });
}
