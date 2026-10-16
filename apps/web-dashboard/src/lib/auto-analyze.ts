import { identityTag } from "@/lib/access";
import { getUserTimezone } from "@/lib/api-helpers";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { fetchSessionsForDate } from "@/lib/session-queries";
import { settingsRepo } from "@/lib/settings-repo";
import { todayInTz, yesterdayInTz } from "@/lib/timezone";
import { type AnalysisOutcome, runAnalysis } from "@/services/analyze-core";
import { sendAnalysisEmail } from "@/services/email-notification";

export interface AutoAnalyzeDeps {
  findAutoSummarizeUsers: () => Promise<string[]>;
  getUserTimezone: (userId: string) => Promise<string>;
  hasAnalysis: (userId: string, date: string) => Promise<boolean>;
  hasSessions: (userId: string, date: string, tz: string) => Promise<boolean>;
  claimForAnalysis: (
    userId: string,
    date: string,
  ) => Promise<{ claimed: boolean; token?: string; reason?: "cached" | "busy" }>;
  releaseAnalysisClaim: (userId: string, date: string, token?: string) => Promise<void>;
  runAnalysis: (
    userId: string,
    date: string,
    tz: string,
    claimToken?: string,
  ) => Promise<AnalysisOutcome>;
  sendEmail?: (params: {
    userId: string;
    date: string;
    outcome: Extract<AnalysisOutcome, { ok: true }>;
  }) => Promise<void>;
  nowFn?: () => number;
}

export interface RunningTask {
  userId: string;
  date: string;
  startedAt: number;
  promise: Promise<void>;
}

export interface AutoAnalyzeOptions {
  staleThresholdMs?: number;
}

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

  async runTick(): Promise<void> {
    const users = await this.deps.findAutoSummarizeUsers();
    if (users.length === 0) return;

    const failures: unknown[] = [];
    const tasks = users.map(async (userId) => {
      try {
        await this.processUser(userId);
      } catch (err) {
        failures.push(err);
        const tag = await identityTag(userId);
        console.error("[AutoAnalyze] user failed", {
          user: tag,
          error: err instanceof Error ? err.message : "error",
        });
      }
    });
    await Promise.all(tasks);
    if (failures.length > 0) {
      throw new Error(`auto-analyze failed for ${failures.length} user(s)`);
    }
  }

  private async processUser(userId: string): Promise<void> {
    const existing = this.runningTasks.get(userId);
    if (existing) {
      const age = this.nowFn() - existing.startedAt;
      if (age > this.staleThresholdMs) {
        this.runningTasks.delete(userId);
      } else {
        return;
      }
    }

    const tz = await this.deps.getUserTimezone(userId);
    const today = todayInTz(tz);
    const yesterday = yesterdayInTz(tz);
    const [todayHasSessions, yesterdayHasAnalysis] = await Promise.all([
      this.deps.hasSessions(userId, today, tz),
      this.deps.hasAnalysis(userId, yesterday),
    ]);
    if (!todayHasSessions || yesterdayHasAnalysis) return;

    const claim = await this.deps.claimForAnalysis(userId, yesterday);
    if (!claim.claimed) return;

    const startedAt = this.nowFn();
    const work = this.runClaimed(userId, yesterday, tz, claim.token);
    this.runningTasks.set(userId, { userId, date: yesterday, startedAt, promise: work });
    try {
      await work;
    } finally {
      if (this.runningTasks.get(userId)?.startedAt === startedAt) {
        this.runningTasks.delete(userId);
      }
    }
  }

  private async runClaimed(
    userId: string,
    date: string,
    tz: string,
    token: string | undefined,
  ): Promise<void> {
    const tag = await identityTag(userId);
    try {
      const outcome = await this.deps.runAnalysis(userId, date, tz, token);
      if (!outcome.ok) {
        console.warn("[AutoAnalyze] analysis skipped or failed", {
          user: tag,
          reason: outcome.reason,
        });
        if (outcome.reason !== "no_sessions" && outcome.reason !== "no_ai_config") {
          throw new Error(outcome.reason);
        }
        return;
      }
      try {
        await (this.deps.sendEmail ?? defaultSendEmail)({ userId, date, outcome });
      } catch (err) {
        console.error("[AutoAnalyze] notification failed", {
          user: tag,
          error: err instanceof Error ? err.message : "error",
        });
      }
    } catch (err) {
      try {
        await this.deps.releaseAnalysisClaim(userId, date, token);
      } catch {
        // lease expiry recovers
      }
      throw err;
    }
  }

  getRunningTasks(): Map<string, { userId: string; date: string; startedAt: number }> {
    const result = new Map<string, { userId: string; date: string; startedAt: number }>();
    for (const [key, task] of this.runningTasks) {
      result.set(key, { userId: task.userId, date: task.date, startedAt: task.startedAt });
    }
    return result;
  }
}

async function defaultSendEmail(params: {
  userId: string;
  date: string;
  outcome: Extract<AnalysisOutcome, { ok: true }>;
}): Promise<void> {
  await sendAnalysisEmail({
    userId: params.userId,
    date: params.date,
    result: params.outcome.result,
    stats: params.outcome.stats,
  });
}

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
    releaseAnalysisClaim: (userId, date, token) =>
      dailySummaryRepo.releaseAnalysisClaim(userId, date, token),
    runAnalysis: (userId, date, tz, claimToken) => runAnalysis(userId, date, tz, { claimToken }),
  };
}

let _instance: AutoAnalyzeService | null = null;

export function createAutoAnalyze(
  deps: AutoAnalyzeDeps,
  options?: AutoAnalyzeOptions,
): AutoAnalyzeService {
  return new AutoAnalyzeService(deps, options);
}

export function getAutoAnalyze(): AutoAnalyzeService {
  if (!_instance) {
    _instance = new AutoAnalyzeService(createDefaultDeps());
  }
  return _instance;
}

export function resetAutoAnalyze(): void {
  _instance = null;
}

export async function runAutoAnalyzeTick(_env: unknown, _scheduledTime: number): Promise<void> {
  await getAutoAnalyze().runTick();
}
