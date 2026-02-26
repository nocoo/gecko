// GET /api/stats — Aggregated usage stats for the current user.
// Supports ?period=today|week|month|all (default: today)

import { requireSession, jsonOk } from "@/lib/api-helpers";
import { query } from "@/lib/d1";

export const dynamic = "force-dynamic";

type Period = "today" | "week" | "month" | "all";

const VALID_PERIODS = new Set<Period>(["today", "week", "month", "all"]);

/** Return a Unix timestamp (seconds) for the start of the given period. */
function periodStartTime(period: Period): number | null {
  if (period === "all") return null;

  const now = new Date();

  if (period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.getTime() / 1000;
  }

  if (period === "week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    return start.getTime() / 1000;
  }

  // month
  const start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  return start.getTime() / 1000;
}

/** GET /api/stats?period=today */
export async function GET(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const periodParam = url.searchParams.get("period") ?? "today";
  const period: Period = VALID_PERIODS.has(periodParam as Period)
    ? (periodParam as Period)
    : "today";

  const startTime = periodStartTime(period);

  // Build WHERE clause
  const conditions = ["user_id = ?"];
  const params: unknown[] = [user.userId];

  if (startTime !== null) {
    conditions.push("start_time >= ?");
    params.push(startTime);
  }

  const where = conditions.join(" AND ");

  // Total stats
  const [totals] = await query<{
    total_sessions: number;
    total_duration: number;
    total_apps: number;
  }>(
    `SELECT
       COUNT(*) as total_sessions,
       COALESCE(SUM(duration), 0) as total_duration,
       COUNT(DISTINCT app_name) as total_apps
     FROM focus_sessions
     WHERE ${where}`,
    params
  );

  // Longest session
  const [longest] = await query<{ max_duration: number }>(
    `SELECT COALESCE(MAX(duration), 0) as max_duration
     FROM focus_sessions
     WHERE ${where}`,
    params
  );

  // Top apps by duration
  const topApps = await query<{
    app_name: string;
    bundle_id: string | null;
    total_duration: number;
    session_count: number;
  }>(
    `SELECT
       app_name,
       bundle_id,
       SUM(duration) as total_duration,
       COUNT(*) as session_count
     FROM focus_sessions
     WHERE ${where}
     GROUP BY app_name
     ORDER BY total_duration DESC
     LIMIT 20`,
    params
  );

  return jsonOk({
    period,
    totalSessions: totals?.total_sessions ?? 0,
    totalDuration: totals?.total_duration ?? 0,
    totalApps: totals?.total_apps ?? 0,
    longestSession: longest?.max_duration ?? 0,
    topApps: topApps.map((app) => ({
      appName: app.app_name,
      bundleId: app.bundle_id,
      totalDuration: app.total_duration,
      sessionCount: app.session_count,
    })),
  });
}
