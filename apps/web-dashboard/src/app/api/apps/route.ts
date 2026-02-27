// GET /api/apps — List unique apps (bundle_id + app_name) the user has tracked.
// Used by the category/tag mapping UI to show available apps.

import { requireSession, jsonOk } from "@/lib/api-helpers";
import { query } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** GET /api/apps */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const rows = await query<{
    bundle_id: string;
    app_name: string;
    total_duration: number;
    session_count: number;
  }>(
    `SELECT
       bundle_id,
       app_name,
       SUM(duration) as total_duration,
       COUNT(*) as session_count
     FROM focus_sessions
     WHERE user_id = ? AND bundle_id IS NOT NULL AND bundle_id != ''
     GROUP BY bundle_id
     ORDER BY total_duration DESC`,
    [user.userId],
  );

  return jsonOk({
    apps: rows.map((row) => ({
      bundleId: row.bundle_id,
      appName: row.app_name,
      totalDuration: row.total_duration,
      sessionCount: row.session_count,
    })),
  });
}
