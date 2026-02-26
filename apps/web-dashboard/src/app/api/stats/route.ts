// GET /api/stats — Aggregated usage stats for the current user.

import { requireSession, jsonOk } from "@/lib/api-helpers";
import { query } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** GET /api/stats */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

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
     WHERE user_id = ?`,
    [user.userId]
  );

  // Top apps by duration
  const topApps = await query<{
    app_name: string;
    total_duration: number;
    session_count: number;
  }>(
    `SELECT
       app_name,
       SUM(duration) as total_duration,
       COUNT(*) as session_count
     FROM focus_sessions
     WHERE user_id = ?
     GROUP BY app_name
     ORDER BY total_duration DESC
     LIMIT 20`,
    [user.userId]
  );

  return jsonOk({
    totalSessions: totals?.total_sessions ?? 0,
    totalDuration: totals?.total_duration ?? 0,
    totalApps: totals?.total_apps ?? 0,
    topApps: topApps.map((app) => ({
      appName: app.app_name,
      totalDuration: app.total_duration,
      sessionCount: app.session_count,
    })),
  });
}
