// POST /api/sync — Batch upload focus sessions from macOS app.
// Authenticated via API key (Bearer gk_<hex>).
//
// Accepts sessions, validates, enqueues into in-memory queue,
// and returns 202 Accepted immediately. Background drain worker
// writes batches to Cloudflare D1 asynchronously.

import { randomUUID } from "node:crypto";
import { requireApiKey, jsonOk, jsonError } from "@/lib/api-helpers";
import { getSyncQueue, type QueuedSession } from "@/lib/sync-queue";

export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 1000;

// Required fields per session
const REQUIRED_FIELDS = [
  "id",
  "app_name",
  "window_title",
  "start_time",
  "duration",
] as const;

interface SyncSession {
  id: string;
  app_name: string;
  window_title: string;
  url: string | null;
  start_time: number;
  duration: number;
  bundle_id: string | null;
  tab_title: string | null;
  tab_count: number | null;
  document_path: string | null;
  is_full_screen: boolean;
  is_minimized: boolean;
}

/** POST /api/sync — Validate + enqueue, return 202 Accepted. */
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

  const { userId, deviceId } = user;
  const syncId = randomUUID();

  // Map incoming sessions to QueuedSession (add server-side fields)
  const queuedSessions: QueuedSession[] = sessions.map((s) => ({
    id: s.id,
    user_id: userId,
    device_id: deviceId,
    app_name: s.app_name,
    window_title: s.window_title,
    url: s.url ?? null,
    start_time: s.start_time,
    duration: s.duration,
    bundle_id: s.bundle_id ?? null,
    tab_title: s.tab_title ?? null,
    tab_count: s.tab_count ?? null,
    document_path: s.document_path ?? null,
    is_full_screen: s.is_full_screen,
    is_minimized: s.is_minimized,
  }));

  // Enqueue — no D1 calls in the request path
  const queue = getSyncQueue();
  const accepted = queue.enqueue(queuedSessions);

  return jsonOk(
    {
      accepted,
      sync_id: syncId,
    },
    202,
  );
}
