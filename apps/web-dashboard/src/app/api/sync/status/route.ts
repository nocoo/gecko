// GET /api/sync/status — Sync health: last sync time per device.

import { requireSession, jsonOk } from "@/lib/api-helpers";
import { query } from "@/lib/d1";

export const dynamic = "force-dynamic";

/** GET /api/sync/status */
export async function GET(_req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  // Get latest sync per device
  const syncLogs = await query<{
    device_id: string;
    session_count: number;
    synced_at: string;
  }>(
    `SELECT device_id, session_count, synced_at
     FROM sync_logs
     WHERE user_id = ?
       AND synced_at = (
         SELECT MAX(s2.synced_at)
         FROM sync_logs s2
         WHERE s2.user_id = sync_logs.user_id
           AND s2.device_id = sync_logs.device_id
       )
     ORDER BY synced_at DESC`,
    [user.userId]
  );

  // Get device names from api_keys
  const keys = await query<{ device_id: string; name: string }>(
    "SELECT device_id, name FROM api_keys WHERE user_id = ?",
    [user.userId]
  );

  const nameMap = new Map(keys.map((k) => [k.device_id, k.name]));

  return jsonOk({
    devices: syncLogs.map((log) => ({
      deviceId: log.device_id,
      name: nameMap.get(log.device_id) ?? "Unknown device",
      lastSync: log.synced_at,
      sessionCount: log.session_count,
    })),
  });
}
