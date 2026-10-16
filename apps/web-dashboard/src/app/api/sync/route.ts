import { randomUUID } from "node:crypto";
import { jsonError, jsonOk, requireApiKey } from "@/lib/api-helpers";
import { OwnershipConflictError, type QueuedSession, writeSessions } from "@/lib/sync-write";

export const dynamic = "force-dynamic";

const MAX_BATCH_SIZE = 1000;
const REQUIRED_FIELDS = ["id", "app_name", "window_title", "start_time", "duration"] as const;

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
    return jsonError(`Batch too large: ${sessions.length} sessions (max ${MAX_BATCH_SIZE})`, 413);
  }

  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    if (!session) {
      return jsonError(`Session at index ${i} is null or undefined`, 400);
    }
    for (const field of REQUIRED_FIELDS) {
      if (session[field] === undefined || session[field] === null) {
        return jsonError(`Session at index ${i} is missing required field: ${field}`, 400);
      }
    }
  }

  const queuedSessions: QueuedSession[] = sessions.map((session) => ({
    id: session.id,
    user_id: user.userId,
    device_id: user.deviceId,
    app_name: session.app_name,
    window_title: session.window_title,
    url: session.url ?? null,
    start_time: session.start_time,
    duration: session.duration,
    bundle_id: session.bundle_id ?? null,
    tab_title: session.tab_title ?? null,
    tab_count: session.tab_count ?? null,
    document_path: session.document_path ?? null,
    is_full_screen: session.is_full_screen,
    is_minimized: session.is_minimized,
  }));

  try {
    const result = await writeSessions(queuedSessions, randomUUID());
    return jsonOk({ accepted: result.accepted, sync_id: result.syncId }, 202);
  } catch (err) {
    if (err instanceof OwnershipConflictError) {
      return jsonError("Session conflict", 409);
    }
    return jsonError("Sync persist failed", 500);
  }
}
