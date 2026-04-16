/**
 * Tests for lib/auto-analyze.ts — auto-analyze service.
 *
 * All I/O dependencies are injected as mocks.
 */

import { describe, test, expect, mock } from "bun:test";
import {
  createAutoAnalyze,
  getAutoAnalyze,
  resetAutoAnalyze,
  ensureAutoAnalyze,
  resetEnsureAutoAnalyze,
  type AutoAnalyzeDeps,
} from "@/lib/auto-analyze";
import type { AnalysisOutcome } from "@/services/analyze-core";
import type { DailyStats } from "@/services/daily-stats";

const stubStats = {} as DailyStats;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<AutoAnalyzeDeps>): AutoAnalyzeDeps {
  return {
    findAutoSummarizeUsers: mock(() => Promise.resolve([] as string[])),
    getUserTimezone: mock(() => Promise.resolve("Asia/Shanghai")),
    hasAnalysis: mock(() => Promise.resolve(false)),
    hasSessions: mock(() => Promise.resolve(false)),
    claimForAnalysis: mock(() => Promise.resolve(true)),
    releaseAnalysisClaim: mock(() => Promise.resolve()),
    runAnalysis: mock(() =>
      Promise.resolve({ ok: true, score: 75, model: "test", provider: "test", durationMs: 100, result: {} as never, prompt: "p", stats: stubStats } as AnalysisOutcome),
    ),
    nowFn: () => Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// onTick — trigger conditions
// ---------------------------------------------------------------------------

describe("AutoAnalyzeService.onTick", () => {
  test("does nothing when no users have autoSummarize", async () => {
    const deps = makeDeps();
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    expect(deps.findAutoSummarizeUsers).toHaveBeenCalledTimes(1);
    expect(deps.getUserTimezone).not.toHaveBeenCalled();
  });

  test("skips users with no today sessions", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    expect(deps.hasSessions).toHaveBeenCalled();
    expect(deps.runAnalysis).not.toHaveBeenCalled();
  });

  test("skips users with existing yesterday analysis", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(true)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    expect(deps.hasAnalysis).toHaveBeenCalled();
    expect(deps.runAnalysis).not.toHaveBeenCalled();
  });

  test("triggers analysis when today has sessions + yesterday unanalyzed", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    expect(deps.runAnalysis).toHaveBeenCalledTimes(1);

    // Verify it was called with yesterday's date
    const call = (deps.runAnalysis as ReturnType<typeof mock>).mock.calls[0]!;
    expect(call[0]).toBe("u1"); // userId
    expect(call[2]).toBe("Asia/Shanghai"); // tz
    // date should be yesterday in Asia/Shanghai — verify it's a valid date string
    expect(call[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("runs analysis as background task (doesn't block tick)", async () => {
    let resolveAnalysis: ((v: AnalysisOutcome) => void) | null = null;
    const analysisPromise = new Promise<AnalysisOutcome>((resolve) => {
      resolveAnalysis = resolve;
    });

    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      runAnalysis: mock(() => analysisPromise),
    });
    const svc = createAutoAnalyze(deps);

    // onTick should return without waiting for analysis to finish
    await svc.onTick();

    // Task should be tracked
    expect(svc.getRunningTasks().size).toBe(1);

    // Resolve the analysis
    resolveAnalysis!({ ok: true, score: 80, model: "m", provider: "p", durationMs: 50, result: {} as never, prompt: "p", stats: stubStats });

    // Give the .finally() callback a chance to run
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.getRunningTasks().size).toBe(0);
  });

  test("cleans up completed tasks from map", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();

    // Wait for the fire-and-forget promise to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.getRunningTasks().size).toBe(0);
  });

  test("skips user if analysis already running (not stale)", async () => {
    let resolveAnalysis: ((v: AnalysisOutcome) => void) | null = null;
    const analysisPromise = new Promise<AnalysisOutcome>((resolve) => {
      resolveAnalysis = resolve;
    });

    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      runAnalysis: mock(() => analysisPromise),
    });
    const svc = createAutoAnalyze(deps);

    // First tick — starts analysis
    await svc.onTick();
    expect(deps.runAnalysis).toHaveBeenCalledTimes(1);

    // Second tick — should skip because task is still running
    await svc.onTick();
    expect(deps.runAnalysis).toHaveBeenCalledTimes(1); // not called again

    // Cleanup
    resolveAnalysis!({ ok: true, score: 80, model: "m", provider: "p", durationMs: 50, result: {} as never, prompt: "p", stats: stubStats });
    await new Promise((r) => setTimeout(r, 10));
  });

  test("removes stale task (>threshold) and allows new analysis", async () => {
    let now = 1000;
    let callCount = 0;

    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      runAnalysis: mock(() => {
        callCount++;
        // First call: never resolves (simulates stale task)
        if (callCount === 1) {
          return new Promise<AnalysisOutcome>(() => {});
        }
        return Promise.resolve({ ok: true, score: 80, model: "m", provider: "p", durationMs: 50, result: {} as never, prompt: "p", stats: stubStats } as AnalysisOutcome);
      }),
      nowFn: () => now,
    });
    const svc = createAutoAnalyze(deps, { staleThresholdMs: 5000 });

    // First tick at t=1000
    await svc.onTick();
    expect(callCount).toBe(1);
    expect(svc.getRunningTasks().size).toBe(1);

    // Second tick at t=2000 — not stale yet
    now = 2000;
    await svc.onTick();
    expect(callCount).toBe(1); // still 1, task not stale

    // Third tick at t=7000 — stale (>5000ms threshold)
    now = 7000;
    await svc.onTick();
    expect(callCount).toBe(2); // new analysis triggered
  });

  test("handles per-user errors without blocking others", async () => {
    let getUserTzCallCount = 0;
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1", "u2"])),
      getUserTimezone: mock(() => {
        getUserTzCallCount++;
        if (getUserTzCallCount === 1) {
          throw new Error("tz lookup failed for u1");
        }
        return Promise.resolve("Asia/Shanghai");
      }),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    // Should not throw — u1 errors are caught, u2 proceeds
    await svc.onTick();
    // u2 should have gotten analysis triggered
    expect(deps.runAnalysis).toHaveBeenCalledTimes(1);
    const call = (deps.runAnalysis as ReturnType<typeof mock>).mock.calls[0]!;
    expect(call[0]).toBe("u2");
  });

  test("handles findAutoSummarizeUsers error gracefully", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.reject(new Error("DB down"))),
    });
    const svc = createAutoAnalyze(deps);

    // Should not throw
    await svc.onTick();
    expect(deps.getUserTimezone).not.toHaveBeenCalled();
  });

  test("skips analysis when claimForAnalysis returns false (another process won)", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      claimForAnalysis: mock(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    expect(deps.claimForAnalysis).toHaveBeenCalledTimes(1);
    expect(deps.runAnalysis).not.toHaveBeenCalled();
  });

  test("calls claimForAnalysis before runAnalysis", async () => {
    const callOrder: string[] = [];
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      claimForAnalysis: mock(() => {
        callOrder.push("claim");
        return Promise.resolve(true);
      }),
      runAnalysis: mock(() => {
        callOrder.push("analyze");
        return Promise.resolve({ ok: true, score: 75, model: "m", provider: "p", durationMs: 50, result: {} as never, prompt: "p", stats: stubStats } as AnalysisOutcome);
      }),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    // Wait for background task
    await new Promise((r) => setTimeout(r, 10));
    expect(callOrder).toEqual(["claim", "analyze"]);
  });
});

// ---------------------------------------------------------------------------
// releaseAnalysisClaim — failure recovery
// ---------------------------------------------------------------------------

describe("releaseAnalysisClaim behavior", () => {
  test("does NOT release claim on successful analysis", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      runAnalysis: mock(() =>
        Promise.resolve({ ok: true, score: 80, model: "m", provider: "p", durationMs: 50, result: {} as never, prompt: "p", stats: stubStats } as AnalysisOutcome),
      ),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    await new Promise((r) => setTimeout(r, 10));

    expect(deps.releaseAnalysisClaim).not.toHaveBeenCalled();
  });

  test("releases claim when analysis returns ok=false", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      runAnalysis: mock(() =>
        Promise.resolve({ ok: false, reason: "ai_error", message: "provider timeout" } as AnalysisOutcome),
      ),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    await new Promise((r) => setTimeout(r, 10));

    expect(deps.releaseAnalysisClaim).toHaveBeenCalledTimes(1);
  });

  test("releases claim when analysis throws unexpected error", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      runAnalysis: mock(() => Promise.reject(new Error("network failure"))),
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();
    await new Promise((r) => setTimeout(r, 10));

    expect(deps.releaseAnalysisClaim).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getRunningTasks
// ---------------------------------------------------------------------------

describe("getRunningTasks()", () => {
  test("returns current state without promise", async () => {
    let resolveAnalysis: ((v: AnalysisOutcome) => void) | null = null;
    const deps = makeDeps({
      findAutoSummarizeUsers: mock(() => Promise.resolve(["u1"])),
      hasSessions: mock(() => Promise.resolve(true)),
      hasAnalysis: mock(() => Promise.resolve(false)),
      runAnalysis: mock(() =>
        new Promise<AnalysisOutcome>((resolve) => {
          resolveAnalysis = resolve;
        }),
      ),
      nowFn: () => 42000,
    });
    const svc = createAutoAnalyze(deps);

    await svc.onTick();

    const tasks = svc.getRunningTasks();
    expect(tasks.size).toBe(1);
    const task = tasks.get("u1");
    expect(task).toBeDefined();
    expect(task!.userId).toBe("u1");
    expect(task!.startedAt).toBe(42000);
    // Verify promise is NOT exposed
    expect((task as Record<string, unknown>).promise).toBeUndefined();

    // Cleanup
    resolveAnalysis!({ ok: true, score: 80, model: "m", provider: "p", durationMs: 50, result: {} as never, prompt: "p", stats: stubStats });
    await new Promise((r) => setTimeout(r, 10));
  });
});

// ---------------------------------------------------------------------------
// Singleton & wiring (getAutoAnalyze, resetAutoAnalyze, ensureAutoAnalyze)
// ---------------------------------------------------------------------------

describe("singleton management", () => {
  test("getAutoAnalyze returns same instance on repeated calls", () => {
    resetAutoAnalyze();
    const a = getAutoAnalyze();
    const b = getAutoAnalyze();
    expect(a).toBe(b);
    resetAutoAnalyze();
  });

  test("resetAutoAnalyze clears singleton so next call creates new instance", () => {
    resetAutoAnalyze();
    const a = getAutoAnalyze();
    resetAutoAnalyze();
    const b = getAutoAnalyze();
    expect(a).not.toBe(b);
    resetAutoAnalyze();
  });

  test("ensureAutoAnalyze is idempotent (only wires once)", () => {
    resetEnsureAutoAnalyze();
    resetAutoAnalyze();
    // First call wires up
    ensureAutoAnalyze();
    // Second call is a no-op (no error)
    ensureAutoAnalyze();
    resetEnsureAutoAnalyze();
    resetAutoAnalyze();
  });
});
