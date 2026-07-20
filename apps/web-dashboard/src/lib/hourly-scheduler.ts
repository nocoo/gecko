/**
 * Generic hourly scheduler.
 *
 * Fires registered callbacks once per interval (default: 1 hour).
 * Follows the SyncQueue pattern: class + factory + lazy singleton.
 *
 * Listeners are called sequentially. One listener's error does not
 * block others. A `ticking` guard prevents re-entrant ticks when
 * a tick takes longer than the interval.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TickCallback = () => void | Promise<void>;

export interface HourlySchedulerOptions {
  /** Start the interval automatically. Default: true. */
  autoStart?: boolean;
  /** Interval in milliseconds. Default: 3_600_000 (1 hour). */
  intervalMs?: number;
}

export interface HourlySchedulerStats {
  running: boolean;
  listenerCount: number;
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class HourlyScheduler {
  private listeners = new Set<TickCallback>();
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(options?: HourlySchedulerOptions) {
    if (options?.autoStart !== false) {
      const ms = options?.intervalMs ?? 3_600_000;
      this.intervalId = setInterval(() => {
        void this.tick();
      }, ms);
    }
  }

  /**
   * Register a callback to be invoked on each tick.
   * Returns an unsubscribe function.
   */
  on(cb: TickCallback): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /**
   * Execute all registered listeners sequentially.
   * Errors are caught per-listener (one failure doesn't block others).
   * Re-entrant calls are skipped (if a tick is already in progress).
   */
  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;

    try {
      for (const cb of this.listeners) {
        try {
          await cb();
        } catch (err) {
          console.error(
            "[HourlyScheduler] listener error:",
            err instanceof Error ? err.message : err,
          );
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  /** Stop the background interval. */
  shutdown(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Get current scheduler state. */
  getStats(): HourlySchedulerStats {
    return {
      running: this.intervalId !== null,
      listenerCount: this.listeners.size,
    };
  }
}

// ---------------------------------------------------------------------------
// Factory + singleton
// ---------------------------------------------------------------------------

/** Create a new HourlyScheduler instance. Useful for testing. */
export function createHourlyScheduler(options?: HourlySchedulerOptions): HourlyScheduler {
  return new HourlyScheduler(options);
}

/** Module-level singleton — used by the auto-analyze wiring. */
let _instance: HourlyScheduler | null = null;

/** Get or create the global HourlyScheduler singleton. */
export function getHourlyScheduler(): HourlyScheduler {
  if (!_instance) {
    _instance = new HourlyScheduler();
  }
  return _instance;
}

/** Reset the singleton (for testing). Shuts down the existing instance. */
export function resetHourlyScheduler(): void {
  _instance?.shutdown();
  _instance = null;
}
