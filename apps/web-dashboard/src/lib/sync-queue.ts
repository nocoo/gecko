// In-memory sync queue with background drain worker.
// Accepts validated focus sessions, buffers them, and
// periodically writes batches to Cloudflare D1.

import { execute } from "@/lib/d1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A fully-resolved session row ready for D1 insertion. */
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

export interface QueueStats {
  pending: number;
  drained: number;
  failed: number;
  running: boolean;
}

/** A function that writes a batch of sessions to storage. */
export type WriteFn = (batch: QueuedSession[]) => Promise<void>;

export interface SyncQueueOptions {
  /** Start the drain interval automatically. Default: true. */
  autoStart?: boolean;
  /** Drain interval in milliseconds. Default: 2000. */
  drainIntervalMs?: number;
  /** Max sessions per D1 INSERT statement. Default: 7 (D1 limit: 100 bind params / 14 cols). */
  batchSize?: number;
  /** Custom write function (for testing). Default: writes to D1. */
  writeFn?: WriteFn;
}

// ---------------------------------------------------------------------------
// SQL builder
// ---------------------------------------------------------------------------

/** Column names for D1 INSERT — must match the focus_sessions schema. */
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

/** Build a multi-row INSERT OR IGNORE statement for a batch of sessions. */
export function buildMultiRowInsert(sessions: QueuedSession[]): {
  sql: string;
  params: unknown[];
} {
  const placeholderRow = `(${COLUMNS.map(() => "?").join(", ")})`;
  const valueRows = sessions.map(() => placeholderRow).join(",\n       ");

  const sql = `INSERT OR IGNORE INTO focus_sessions
       (${COLUMNS.join(", ")})
       VALUES ${valueRows}`;

  const params: unknown[] = [];
  for (const s of sessions) {
    params.push(
      s.id,
      s.user_id,
      s.device_id,
      s.app_name,
      s.window_title,
      s.url ?? null,
      s.start_time,
      s.duration,
      s.bundle_id ?? null,
      s.tab_title ?? null,
      s.tab_count ?? null,
      s.document_path ?? null,
      s.is_full_screen ? 1 : 0,
      s.is_minimized ? 1 : 0,
    );
  }

  return { sql, params };
}

// ---------------------------------------------------------------------------
// Default write function — writes a batch to D1 via multi-row INSERT
// ---------------------------------------------------------------------------

async function defaultWriteFn(batch: QueuedSession[]): Promise<void> {
  const { sql, params } = buildMultiRowInsert(batch);
  await execute(sql, params);
}

// ---------------------------------------------------------------------------
// SyncQueue class
// ---------------------------------------------------------------------------

export class SyncQueue {
  private items: QueuedSession[] = [];
  private drainedCount = 0;
  private failedCount = 0;
  private draining = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly writeFn: WriteFn;
  private readonly batchSize: number;

  constructor(options: SyncQueueOptions = {}) {
    this.writeFn = options.writeFn ?? defaultWriteFn;
    // D1 has a 100 bind parameter limit per statement.
    // 14 columns per row → max 7 rows per INSERT (7 × 14 = 98).
    this.batchSize = options.batchSize ?? 7;

    if (options.autoStart !== false) {
      const ms = options.drainIntervalMs ?? 2000;
      this.intervalId = setInterval(() => {
        void this.drain();
      }, ms);
    }
  }

  /** Add sessions to the queue. Returns the number of items enqueued. */
  enqueue(sessions: QueuedSession[]): number {
    if (sessions.length === 0) return 0;
    this.items.push(...sessions);
    return sessions.length;
  }

  /** Drain all pending items in batches. Safe to call concurrently. */
  async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;

    try {
      while (this.items.length > 0) {
        const batch = this.items.splice(0, this.batchSize);
        try {
          await this.writeFn(batch);
          this.drainedCount += batch.length;
        } catch (err) {
          this.failedCount += batch.length;
          console.error(
            `[SyncQueue] batch write failed (${batch.length} items):`,
            err instanceof Error ? err.message : err,
          );
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /** Get current queue statistics. */
  getStats(): QueueStats {
    return {
      pending: this.items.length,
      drained: this.drainedCount,
      failed: this.failedCount,
      running: this.intervalId !== null,
    };
  }

  /** Stop the background drain interval. */
  shutdown(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Factory + singleton
// ---------------------------------------------------------------------------

/** Create a new SyncQueue instance. Useful for testing. */
export function createSyncQueue(options: SyncQueueOptions = {}): SyncQueue {
  return new SyncQueue(options);
}

/** Module-level singleton — used by the sync route. */
let _instance: SyncQueue | null = null;

/** Get or create the global SyncQueue singleton. */
export function getSyncQueue(): SyncQueue {
  if (!_instance) {
    _instance = new SyncQueue();
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetSyncQueue(): void {
  _instance?.shutdown();
  _instance = null;
}
