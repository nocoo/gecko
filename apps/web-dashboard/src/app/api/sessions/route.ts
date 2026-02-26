// GET /api/sessions — List user's focus sessions (paginated).

import { requireSession, jsonOk } from "@/lib/api-helpers";
import { query } from "@/lib/d1";

export const dynamic = "force-dynamic";

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

/** GET /api/sessions?limit=50&offset=0 */
export async function GET(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  const rows = await query<{
    id: string;
    app_name: string;
    window_title: string;
    url: string | null;
    start_time: number;
    end_time: number;
    duration: number;
    bundle_id: string | null;
    tab_title: string | null;
    tab_count: number | null;
    document_path: string | null;
    is_full_screen: number;
    is_minimized: number;
    device_id: string;
    synced_at: string;
  }>(
    `SELECT id, app_name, window_title, url, start_time, end_time, duration,
            bundle_id, tab_title, tab_count, document_path,
            is_full_screen, is_minimized, device_id, synced_at
     FROM focus_sessions
     WHERE user_id = ?
     ORDER BY start_time DESC
     LIMIT ? OFFSET ?`,
    [user.userId, limit, offset]
  );

  return jsonOk({
    sessions: rows.map((row) => ({
      id: row.id,
      appName: row.app_name,
      windowTitle: row.window_title,
      url: row.url,
      startTime: row.start_time,
      endTime: row.end_time,
      duration: row.duration,
      bundleId: row.bundle_id,
      tabTitle: row.tab_title,
      tabCount: row.tab_count,
      documentPath: row.document_path,
      isFullScreen: !!row.is_full_screen,
      isMinimized: !!row.is_minimized,
      deviceId: row.device_id,
      syncedAt: row.synced_at,
    })),
    limit,
    offset,
  });
}
