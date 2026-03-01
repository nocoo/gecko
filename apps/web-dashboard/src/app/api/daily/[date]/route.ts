/**
 * GET /api/daily/[date] — Daily review data.
 *
 * Returns rule-based stats (always computed fresh) and cached AI analysis.
 * Stats are recomputed on every request using timezone-aware day boundaries.
 * Date must be YYYY-MM-DD and not in the future.
 */

import { requireSession, jsonOk, jsonError, getUserTimezone } from "@/lib/api-helpers";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { computeDailyStats } from "@/services/daily-stats";
import { todayInTz } from "@/lib/timezone";
import { fetchSessionsForDate } from "@/lib/session-queries";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate date format and ensure it's not in the future (user's timezone). */
function validateDate(dateStr: string, tz: string): string | null {
  if (!DATE_RE.test(dateStr)) {
    return "Invalid date format. Use YYYY-MM-DD.";
  }
  // Basic validity check — parse as UTC to avoid server-tz dependency
  const [y, m, d] = dateStr.split("-").map(Number);
  const test = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(test.getTime()) || test.getUTCFullYear() !== y || test.getUTCMonth() !== m - 1 || test.getUTCDate() !== d) {
    return "Invalid date.";
  }
  // Must not be in the future
  const today = todayInTz(tz);
  if (dateStr > today) {
    return "Cannot view future dates.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
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

  // Always compute stats fresh — the session query uses timezone-aware
  // day boundaries, and the computation is fast (pure CPU, no I/O).
  // This avoids stale cache issues from before the timezone fix.
  const rows = await fetchSessionsForDate(user.userId, date, tz);
  const stats = computeDailyStats(date, rows);

  // AI result: check cached analysis (AI is expensive, so we do cache it)
  const cached = await dailySummaryRepo.findByUserAndDate(user.userId, date);
  const ai = cached?.ai_result_json
    ? {
        score: cached.ai_score,
        result: JSON.parse(cached.ai_result_json),
        model: cached.ai_model,
        generatedAt: cached.ai_generated_at,
      }
    : null;

  return jsonOk({ stats, ai, timezone: tz });
}
