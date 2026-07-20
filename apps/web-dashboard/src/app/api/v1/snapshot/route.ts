/**
 * GET /api/v1/snapshot?date=YYYY-MM-DD — Public API (API key auth).
 *
 * Returns the full daily snapshot for a given date:
 * - Computed stats (scores, topApps, session timeline)
 * - Cached AI analysis (if available)
 *
 * Authentication: Bearer token (gk_xxx) via Authorization header.
 */

import { getUserTimezone, jsonError, jsonOk, requireApiKey } from "@/lib/api-helpers";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { fetchSessionsForDate } from "@/lib/session-queries";
import { todayInTz } from "@/lib/timezone";
import { computeDailyStats } from "@/services/daily-stats";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
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

  if (dateStr > todayInTz(tz)) {
    return "Cannot query future dates.";
  }

  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(req: Request): Promise<Response> {
  const { user, error } = await requireApiKey(req);
  if (error) return error;

  // Parse ?date= query param
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");

  if (!dateParam) {
    return jsonError("Missing required query parameter: date (YYYY-MM-DD)", 400);
  }

  const tz = await getUserTimezone(user.userId);

  const validationError = validateDate(dateParam, tz);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  // Compute stats fresh from sessions
  const rows = await fetchSessionsForDate(user.userId, dateParam, tz);
  const stats = computeDailyStats(dateParam, rows);

  // Cached AI analysis (if any)
  const cached = await dailySummaryRepo.findByUserAndDate(user.userId, dateParam);
  const ai = cached?.ai_result_json
    ? {
        score: cached.ai_score,
        result: JSON.parse(cached.ai_result_json),
        model: cached.ai_model,
        generatedAt: cached.ai_generated_at,
      }
    : null;

  return jsonOk({
    date: dateParam,
    timezone: tz,
    stats,
    ai,
  });
}
