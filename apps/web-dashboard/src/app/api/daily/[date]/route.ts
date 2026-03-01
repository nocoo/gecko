/**
 * GET /api/daily/[date] — Daily review data.
 *
 * Returns rule-based stats (with scores) and cached AI analysis.
 * Computes and caches stats on first request for a date.
 * Date must be YYYY-MM-DD and strictly before today.
 */

import { requireSession, jsonOk, jsonError, getUserTimezone } from "@/lib/api-helpers";
import { query } from "@/lib/d1";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import {
  computeDailyStats,
  type SessionRow,
  type DailyStats,
} from "@/services/daily-stats";
import { todayInTz, getDateBoundsEpoch } from "@/lib/timezone";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate date format and ensure it's before today in user's timezone. */
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
  // Must be before today in user's timezone
  const today = todayInTz(tz);
  if (dateStr >= today) {
    return "Cannot view today or future dates. Data is still being collected.";
  }
  return null;
}

/** Fetch sessions for a specific date from D1, using user's timezone for day boundaries. */
async function fetchSessionsForDate(
  userId: string,
  date: string,
  tz: string,
): Promise<SessionRow[]> {
  const { start: dayStart, end: dayEnd } = getDateBoundsEpoch(date, tz);

  return query<SessionRow>(
    `SELECT id, app_name, bundle_id, window_title, url, start_time, duration
     FROM focus_sessions
     WHERE user_id = ? AND start_time >= ? AND start_time < ?
     ORDER BY start_time ASC`,
    [userId, dayStart, dayEnd],
  );
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

  // Check cache
  const cached = await dailySummaryRepo.findByUserAndDate(user.userId, date);

  let stats: DailyStats;

  if (cached) {
    stats = JSON.parse(cached.stats_json) as DailyStats;
  } else {
    // Compute fresh stats
    const rows = await fetchSessionsForDate(user.userId, date, tz);
    stats = computeDailyStats(date, rows);

    // Cache stats (fire-and-forget)
    dailySummaryRepo
      .upsertStats(user.userId, date, JSON.stringify(stats))
      .catch(() => {
        /* ignore cache write errors */
      });
  }

  // AI result (may be null)
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
