// GET /api/stats/timeline — Daily aggregated screen time for charts.
// Supports ?period=week|month|all (default: week)
// Returns an array of { date, totalDuration, sessionCount } per day.

import { requireSession, jsonOk } from "@/lib/api-helpers";
import { query } from "@/lib/d1";

export const dynamic = "force-dynamic";

type Period = "week" | "month" | "all";

const VALID_PERIODS = new Set<Period>(["week", "month", "all"]);

/** Number of days to look back for each period. */
function periodDays(period: Period): number | null {
  if (period === "week") return 7;
  if (period === "month") return 30;
  return null; // all
}

export async function GET(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "week";
  const period: Period = VALID_PERIODS.has(periodParam as Period)
    ? (periodParam as Period)
    : "week";

  const days = periodDays(period);

  // Build WHERE clause
  const conditions = ["user_id = ?"];
  const params: unknown[] = [user.userId];

  if (days !== null) {
    // Calculate start-of-day N days ago (UTC)
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days);
    start.setUTCHours(0, 0, 0, 0);
    const startTime = Math.floor(start.getTime() / 1000);
    conditions.push("start_time >= ?");
    params.push(startTime);
  }

  const where = conditions.join(" AND ");

  // Aggregate by date (UTC) — D1 uses SQLite date functions
  const rows = await query<{
    date: string;
    total_duration: number;
    session_count: number;
    app_count: number;
  }>(
    `SELECT
       date(start_time, 'unixepoch') as date,
       COALESCE(SUM(duration), 0) as total_duration,
       COUNT(*) as session_count,
       COUNT(DISTINCT app_name) as app_count
     FROM focus_sessions
     WHERE ${where}
     GROUP BY date(start_time, 'unixepoch')
     ORDER BY date ASC`,
    params
  );

  return jsonOk({
    period,
    timeline: rows.map((r) => ({
      date: r.date,
      totalDuration: r.total_duration,
      sessionCount: r.session_count,
      appCount: r.app_count,
    })),
  });
}
