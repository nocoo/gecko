/**
 * Auto-analyze service.
 *
 * Registered as a HourlyScheduler callback. On each tick:
 *   1. Finds users with ai.autoSummarize enabled
 *   2. For each user, checks if yesterday needs analysis
 *   3. Fires analysis as a background task (fire-and-forget)
 *
 * Dependencies are injected for testability.
 * Follows the SyncQueue pattern: class + factory + lazy singleton.
 */

import { getUserTimezone } from "@/lib/api-helpers";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { getHourlyScheduler } from "@/lib/hourly-scheduler";
import { fetchSessionsForDate } from "@/lib/session-queries";
import { settingsRepo } from "@/lib/settings-repo";
import { todayInTz, yesterdayInTz } from "@/lib/timezone";
import { type AnalysisOutcome, runAnalysis } from "@/services/analyze-core";
import { sendAnalysisEmail } from "@/services/email-notification";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoAnalyzeDeps {
  /** Find user IDs with autoSummarize enabled. */
  findAutoSummarizeUsers: () => Promise<string[]>;
  /** Get user timezone. */
  getUserTimezone: (userId: string) => Promise<string>;
  /** Check if AI analysis exists for user+date. */
  hasAnalysis: (userId: string, date: string) => Promise<boolean>;
  /** Check if sessions exist for user+date. */
  hasSessions: (userId: string, date: string, tz: string) => Promise<boolean>;
  /**
   * Atomically claim a (user, date) slot for analysis.
   * Returns true if this process won the claim, false if another process
   * already claimed it. Prevents duplicate AI spend across workers.
   */
  claimForAnalysis: (userId: string, date: string) => Promise<boolean>;
  /**
   * Release a claimed slot on analysis failure.
   * Deletes the placeholder so the next tick can retry.
   */
  releaseAnalysisClaim: (userId: string, date: string) => Promise<void>;
  /** Run the actual AI analysis. */
  runAnalysis: (userId: string, date: string, tz: string) => Promise<AnalysisOutcome>;
  /** Get current time (injected for testing). Default: Date.now */
  nowFn?: () => number;
}

export interface RunningTask {
  userId: string;
  date: string;
  startedAt: number;
  promise: Promise<AnalysisOutcome>;
}

export interface AutoAnalyzeOptions {
  /** Time after which a running task is considered stale. Default: 3_600_000 (1h). */
  staleThresholdMs?: number;
}

// ---------------------------------------------------------------------------
// Class
// ---------------------------------------------------------------------------

export class AutoAnalyzeService {
  private runningTasks = new Map<string, RunningTask>();
  private readonly deps: AutoAnalyzeDeps;
  private readonly staleThresholdMs: number;
  private readonly nowFn: () => number;

  constructor(deps: AutoAnalyzeDeps, options?: AutoAnalyzeOptions) {
    this.deps = deps;
    this.staleThresholdMs = options?.staleThresholdMs ?? 3_600_000;
    this.nowFn = deps.nowFn ?? Date.now;
  }

  /**
   * Called by HourlyScheduler on each tick.
   * Finds eligible users and triggers background analysis.
   */
  async onTick(): Promise<void> {
    let users: string[];
    try {
      users = await this.deps.findAutoSummarizeUsers();
    } catch (err) {
      console.error(
        "[AutoAnalyze] Failed to find auto-summarize users:",
        err instanceof Error ? err.message : err,
      );
      return;
    }

    if (users.length === 0) return;

    for (const userId of users) {
      try {
        await this.processUser(userId);
      } catch (err) {
        console.error(
          `[AutoAnalyze] Error processing user ${userId}:`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  private async processUser(userId: string): Promise<void> {
    // Check if a task is already running for this user
    const existing = this.runningTasks.get(userId);
    if (existing) {
      const age = this.nowFn() - existing.startedAt;
      if (age > this.staleThresholdMs) {
        // Stale task — remove from tracking (can't cancel the Promise)
        console.warn(
          `[AutoAnalyze] Stale task for user ${userId} (${Math.round(age / 1000)}s old), removing from tracking`,
        );
        this.runningTasks.delete(userId);
      } else {
        // Still running, skip
        return;
      }
    }

    // Determine dates in user's timezone
    const tz = await this.deps.getUserTimezone(userId);
    const today = todayInTz(tz);
    const yesterday = yesterdayInTz(tz);

    // Trigger condition:
    // 1. Today has sessions (user's Mac is active today = new day started)
    // 2. Yesterday has no analysis yet
    const [todayHasSessions, yesterdayHasAnalysis] = await Promise.all([
      this.deps.hasSessions(userId, today, tz),
      this.deps.hasAnalysis(userId, yesterday),
    ]);

    if (!todayHasSessions || yesterdayHasAnalysis) {
      return;
    }

    // Atomically claim this (user, date) slot in the DB.
    // If another process already claimed it, skip — prevents duplicate AI spend.
    const claimed = await this.deps.claimForAnalysis(userId, yesterday);
    if (!claimed) {
      return;
    }

    // Fire analysis as background task
    console.log(`[AutoAnalyze] Triggering analysis for user ${userId} date ${yesterday}`);
    const promise = this.deps.runAnalysis(userId, yesterday, tz);

    const task: RunningTask = {
      userId,
      date: yesterday,
      startedAt: this.nowFn(),
      promise,
    };
    this.runningTasks.set(userId, task);

    // Clean up when done (fire-and-forget)
    promise
      .then(async (outcome) => {
        if (outcome.ok) {
          console.log(
            `[AutoAnalyze] Analysis complete for user ${userId} date ${yesterday}: score=${outcome.score}`,
          );
          // Fire-and-forget email notification.
          // sendAnalysisEmail is documented "Never throws"; the .catch is
          // defense-in-depth only, hence not reachable from tests.
          sendAnalysisEmail({
            userId,
            date: yesterday,
            result: outcome.result,
            stats: outcome.stats,
            /* v8 ignore next */
          }).catch(() => {
            // swallow — sendAnalysisEmail already handles errors internally
          });
        } else {
          console.warn(
            `[AutoAnalyze] Analysis failed for user ${userId} date ${yesterday}: ${outcome.reason} — ${outcome.message}`,
          );
          // Release the DB claim so the next tick can retry
          await this.deps.releaseAnalysisClaim(userId, yesterday);
        }
      })
      .catch(async (err) => {
        console.error(
          `[AutoAnalyze] Unexpected error for user ${userId}:`,
          err instanceof Error ? err.message : err,
        );
        // Release the DB claim so the next tick can retry
        try {
          await this.deps.releaseAnalysisClaim(userId, yesterday);
        } catch {
          // Best-effort release — don't mask the original error
        }
      })
      .finally(() => {
        // Only remove if it's still the same task (not replaced by a new one)
        if (this.runningTasks.get(userId) === task) {
          this.runningTasks.delete(userId);
        }
      });
  }

  /** Get current running task info (for monitoring/debugging). */
  getRunningTasks(): Map<string, { userId: string; date: string; startedAt: number }> {
    const result = new Map<string, { userId: string; date: string; startedAt: number }>();
    for (const [key, task] of this.runningTasks) {
      result.set(key, {
        userId: task.userId,
        date: task.date,
        startedAt: task.startedAt,
      });
    }
    return result;
  }
}

// ---------------------------------------------------------------------------
// Default dependency bindings (production)
// ---------------------------------------------------------------------------

function createDefaultDeps(): AutoAnalyzeDeps {
  return {
    findAutoSummarizeUsers: () => settingsRepo.findUserIdsByKeyValue("ai.autoSummarize", "true"),
    getUserTimezone: (userId) => getUserTimezone(userId),
    hasAnalysis: async (userId, date) => {
      const row = await dailySummaryRepo.findByUserAndDate(userId, date);
      return row?.ai_result_json != null;
    },
    hasSessions: async (userId, date, tz) => {
      const rows = await fetchSessionsForDate(userId, date, tz);
      return rows.length > 0;
    },
    claimForAnalysis: (userId, date) => dailySummaryRepo.claimForAnalysis(userId, date),
    releaseAnalysisClaim: (userId, date) => dailySummaryRepo.releaseAnalysisClaim(userId, date),
    runAnalysis: (userId, date, tz) => runAnalysis(userId, date, tz),
  };
}

// ---------------------------------------------------------------------------
// Factory + singleton
// ---------------------------------------------------------------------------

/** Create a new AutoAnalyzeService instance. Useful for testing. */
export function createAutoAnalyze(
  deps: AutoAnalyzeDeps,
  options?: AutoAnalyzeOptions,
): AutoAnalyzeService {
  return new AutoAnalyzeService(deps, options);
}

/** Module-level singleton. */
let _instance: AutoAnalyzeService | null = null;

/** Get or create the global AutoAnalyzeService singleton. */
export function getAutoAnalyze(): AutoAnalyzeService {
  if (!_instance) {
    _instance = new AutoAnalyzeService(createDefaultDeps());
  }
  return _instance;
}

/** Reset the singleton (for testing). */
export function resetAutoAnalyze(): void {
  _instance = null;
}

// ---------------------------------------------------------------------------
// Lazy initialization wiring
// ---------------------------------------------------------------------------

let _initialized = false;

/**
 * Wire up the auto-analyze scheduler.
 * Called once on first daily route import — idempotent.
 */
export function ensureAutoAnalyze(): void {
  if (_initialized) return;
  _initialized = true;

  const scheduler = getHourlyScheduler();
  const service = getAutoAnalyze();
  scheduler.on(() => service.onTick());

  console.log("[AutoAnalyze] Scheduler wired up — will check every hour");
}

/** Reset initialization flag (for testing). */
export function resetEnsureAutoAnalyze(): void {
  _initialized = false;
}
