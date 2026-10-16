import { batchExecute, query } from "@/lib/d1";

export interface QueuedSession {
  id: string;
  user_id: string;
  device_id: string;
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

export const COLUMNS = [
  "id",
  "user_id",
  "device_id",
  "app_name",
  "window_title",
  "url",
  "start_time",
  "duration",
  "bundle_id",
  "tab_title",
  "tab_count",
  "document_path",
  "is_full_screen",
  "is_minimized",
] as const;

export class OwnershipConflictError extends Error {
  constructor() {
    super("Session ownership conflict");
    this.name = "OwnershipConflictError";
  }
}

export function buildMultiRowInsert(sessions: QueuedSession[]): { sql: string; params: unknown[] } {
  const placeholderRow = `(${COLUMNS.map(() => "?").join(", ")})`;
  const valueRows = sessions.map(() => placeholderRow).join(",\n       ");
  const sql = `INSERT INTO focus_sessions
       (${COLUMNS.join(", ")})
       VALUES ${valueRows}
       ON CONFLICT(id) DO NOTHING`;
  const params: unknown[] = [];
  for (const session of sessions) {
    params.push(
      session.id,
      session.user_id,
      session.device_id,
      session.app_name,
      session.window_title,
      session.url ?? null,
      session.start_time,
      session.duration,
      session.bundle_id ?? null,
      session.tab_title ?? null,
      session.tab_count ?? null,
      session.document_path ?? null,
      session.is_full_screen ? 1 : 0,
      session.is_minimized ? 1 : 0,
    );
  }
  return { sql, params };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export async function writeSessions(
  sessions: QueuedSession[],
  syncId: string,
): Promise<{ accepted: number; syncId: string }> {
  if (sessions.length === 0) {
    throw new Error("sessions must not be empty");
  }
  const userId = sessions[0]?.user_id;
  if (!userId) {
    throw new Error("user_id is required");
  }

  const insertItems = chunk(sessions, 7).map((batch) => buildMultiRowInsert(batch));
  await batchExecute(insertItems);

  const uniqueIds = [...new Set(sessions.map((session) => session.id))];
  const owned = new Map<string, string>();
  for (const ids of chunk(uniqueIds, 90)) {
    const placeholders = ids.map(() => "?").join(", ");
    const rows = await query<{ id: string; user_id: string }>(
      `SELECT id, user_id FROM focus_sessions WHERE id IN (${placeholders})`,
      ids,
    );
    for (const row of rows) {
      owned.set(row.id, row.user_id);
    }
  }

  for (const id of uniqueIds) {
    const owner = owned.get(id);
    if (!owner || owner !== userId) {
      throw new OwnershipConflictError();
    }
  }

  const startTimes = sessions.map((session) => session.start_time);
  const firstStart = Math.min(...startTimes);
  const lastStart = Math.max(...startTimes);
  await batchExecute([
    {
      sql: `INSERT INTO sync_logs (id, user_id, device_id, session_count, first_start, last_start, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      params: [
        syncId,
        userId,
        sessions[0]?.device_id ?? "",
        sessions.length,
        firstStart,
        lastStart,
      ],
    },
  ]);

  return { accepted: sessions.length, syncId };
}
