// POST /api/sync — Batch upload focus sessions from macOS app.
// Authenticated via API key (Bearer gk_<hex>).

import { randomUUID } from "node:crypto";
import { requireApiKey, jsonOk, jsonError } from "@/lib/api-helpers";
import { execute } from "@/lib/d1";

export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 1000;

// Required fields per session
const REQUIRED_FIELDS = [
  "id",
  "app_name",
  "window_title",
  "start_time",
  "end_time",
  "duration",
] as const;

interface SyncSession {
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
  is_full_screen: boolean;
  is_minimized: boolean;
}

/** POST /api/sync — Batch upload focus sessions. */
export async function POST(req: Request): Promise<Response> {
  const { user, error } = await requireApiKey(req);
  if (error) return error;

  let body: { sessions?: SyncSession[] };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const { sessions } = body;

  if (!sessions || !Array.isArray(sessions) || sessions.length === 0) {
    return jsonError("sessions array is required and must not be empty", 400);
  }

  if (sessions.length > MAX_BATCH_SIZE) {
    return jsonError(
      `Batch too large: ${sessions.length} sessions (max ${MAX_BATCH_SIZE})`,
      413
    );
  }

  // Validate required fields on each session
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    for (const field of REQUIRED_FIELDS) {
      if (session[field] === undefined || session[field] === null) {
        return jsonError(
          `Session at index ${i} is missing required field: ${field}`,
          400
        );
      }
    }
  }

  const now = new Date().toISOString();
  const { userId, deviceId } = user;

  // INSERT OR IGNORE each session — idempotent on session id
  let insertedCount = 0;
  for (const session of sessions) {
    const result = await execute(
      `INSERT OR IGNORE INTO focus_sessions
       (id, user_id, device_id, app_name, window_title, url,
        start_time, end_time, duration, bundle_id, tab_title,
        tab_count, document_path, is_full_screen, is_minimized, synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.id,
        userId,
        deviceId,
        session.app_name,
        session.window_title,
        session.url ?? null,
        session.start_time,
        session.end_time,
        session.duration,
        session.bundle_id ?? null,
        session.tab_title ?? null,
        session.tab_count ?? null,
        session.document_path ?? null,
        session.is_full_screen ? 1 : 0,
        session.is_minimized ? 1 : 0,
        now,
      ]
    );
    insertedCount += result.meta.changes;
  }

  const duplicates = sessions.length - insertedCount;

  // Create sync log entry
  const syncId = randomUUID();
  const startTimes = sessions.map((s) => s.start_time);
  const firstStart = Math.min(...startTimes);
  const lastStart = Math.max(...startTimes);

  await execute(
    `INSERT INTO sync_logs (id, user_id, device_id, session_count, first_start, last_start, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [syncId, userId, deviceId, sessions.length, firstStart, lastStart, now]
  );

  return jsonOk({
    inserted: insertedCount,
    duplicates,
    sync_id: syncId,
  });
}
