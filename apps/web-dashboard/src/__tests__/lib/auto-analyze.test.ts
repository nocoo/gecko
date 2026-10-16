/**
 * Tests for lib/auto-analyze.ts — auto-analyze service.
 *
 * All I/O dependencies are injected as mocks.
 */

import { describe, expect, test, vi } from "vitest";
import {
  type AutoAnalyzeDeps,
  createAutoAnalyze,
  getAutoAnalyze,
  resetAutoAnalyze,
} from "@/lib/auto-analyze";
import type { AnalysisOutcome } from "@/services/analyze-core";
import type { DailyStats } from "@/services/daily-stats";

const stubStats = {} as DailyStats;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDeps(overrides?: Partial<AutoAnalyzeDeps>): AutoAnalyzeDeps {
  return {
    findAutoSummarizeUsers: vi.fn(() => Promise.resolve([] as string[])),
    getUserTimezone: vi.fn(() => Promise.resolve("Asia/Shanghai")),
    hasAnalysis: vi.fn(() => Promise.resolve(false)),
    hasSessions: vi.fn(() => Promise.resolve(false)),
    claimForAnalysis: vi.fn(() => Promise.resolve({ claimed: true, token: "tok" })),
    releaseAnalysisClaim: vi.fn(() => Promise.resolve()),
    runAnalysis: vi.fn(() =>
      Promise.resolve({
        ok: true,
        score: 75,
        model: "test",
        provider: "test",
        durationMs: 100,
        result: {} as never,
        prompt: "p",
        stats: stubStats,
      } as AnalysisOutcome),
    ),
    nowFn: () => Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// onTick — trigger conditions
// ---------------------------------------------------------------------------

describe("AutoAnalyzeService.runTick", () => {
  test("does nothing when no users have autoSummarize", async () => {
    const deps = makeDeps();
    const svc = createAutoAnalyze(deps);

    await svc.runTick();
    expect(deps.findAutoSummarizeUsers).toHaveBeenCalledTimes(1);
    expect(deps.getUserTimezone).not.toHaveBeenCalled();
  });

  test("skips users with no today sessions", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.runTick();
    expect(deps.hasSessions).toHaveBeenCalled();
    expect(deps.runAnalysis).not.toHaveBeenCalled();
  });

  test("skips users with existing yesterday analysis", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(true)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.runTick();
    expect(deps.hasAnalysis).toHaveBeenCalled();
    expect(deps.runAnalysis).not.toHaveBeenCalled();
  });

  test("triggers analysis when today has sessions + yesterday unanalyzed", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.runTick();
    expect(deps.runAnalysis).toHaveBeenCalledTimes(1);

    // Verify it was called with yesterday's date
    const call = (deps.runAnalysis as ReturnType<typeof vi.fn>).mock.calls[0]!;
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
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() => analysisPromise),
    });
    const svc = createAutoAnalyze(deps);

    const tick = svc.runTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(svc.getRunningTasks().size).toBe(1);

    resolveAnalysis!({
      ok: true,
      score: 80,
      model: "m",
      provider: "p",
      durationMs: 50,
      result: {} as never,
      prompt: "p",
      stats: stubStats,
    });
    await tick;
    expect(svc.getRunningTasks().size).toBe(0);
  });

  test("cleans up completed tasks from map", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    await svc.runTick();

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
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() => analysisPromise),
    });
    const svc = createAutoAnalyze(deps);

    const first = svc.runTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(deps.runAnalysis).toHaveBeenCalledTimes(1);

    const second = svc.runTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(deps.runAnalysis).toHaveBeenCalledTimes(1);

    resolveAnalysis!({
      ok: true,
      score: 80,
      model: "m",
      provider: "p",
      durationMs: 50,
      result: {} as never,
      prompt: "p",
      stats: stubStats,
    });
    await first;
    await second;
  });

  test("removes stale task (>threshold) and allows new analysis", async () => {
    let now = 1000;
    let callCount = 0;

    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() => {
        callCount++;
        // First call: never resolves (simulates stale task)
        if (callCount === 1) {
          return new Promise<AnalysisOutcome>(() => {});
        }
        return Promise.resolve({
          ok: true,
          score: 80,
          model: "m",
          provider: "p",
          durationMs: 50,
          result: {} as never,
          prompt: "p",
          stats: stubStats,
        } as AnalysisOutcome);
      }),
      nowFn: () => now,
    });
    const svc = createAutoAnalyze(deps, { staleThresholdMs: 5000 });

    const first = svc.runTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(callCount).toBe(1);
    expect(svc.getRunningTasks().size).toBe(1);

    now = 2000;
    const second = svc.runTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(callCount).toBe(1);

    now = 7000;
    const third = svc.runTick();
    await new Promise((r) => setTimeout(r, 10));
    expect(callCount).toBe(2);
    void first;
    void second;
    void third;
  });

  test("handles per-user errors without blocking others", async () => {
    let getUserTzCallCount = 0;
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1", "u2"])),
      getUserTimezone: vi.fn(() => {
        getUserTzCallCount++;
        if (getUserTzCallCount === 1) {
          throw new Error("tz lookup failed for u1");
        }
        return Promise.resolve("Asia/Shanghai");
      }),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);

    await expect(svc.runTick()).rejects.toThrow("auto-analyze failed for 1 user(s)");
    expect(deps.runAnalysis).toHaveBeenCalledTimes(1);
    const call = (deps.runAnalysis as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(call[0]).toBe("u2");
  });

  test("handles findAutoSummarizeUsers error gracefully", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.reject(new Error("DB down"))),
    });
    const svc = createAutoAnalyze(deps);

    await expect(svc.runTick()).rejects.toThrow("DB down");
    expect(deps.getUserTimezone).not.toHaveBeenCalled();
  });

  test("does not fail the tick for no_sessions or no_ai_config", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1", "u2"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn((userId: string) =>
        Promise.resolve(
          userId === "u1"
            ? { ok: false, reason: "no_sessions" as const, message: "none" }
            : { ok: false, reason: "no_ai_config" as const, message: "none" },
        ),
      ),
    });
    await createAutoAnalyze(deps).runTick();
    expect(deps.releaseAnalysisClaim).not.toHaveBeenCalled();
  });

  test("skips analysis when claimForAnalysis returns false (another process won)", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      claimForAnalysis: vi.fn(() => Promise.resolve({ claimed: false, reason: "busy" })),
    });
    const svc = createAutoAnalyze(deps);

    await svc.runTick();
    expect(deps.claimForAnalysis).toHaveBeenCalledTimes(1);
    expect(deps.runAnalysis).not.toHaveBeenCalled();
  });

  test("calls claimForAnalysis before runAnalysis", async () => {
    const callOrder: string[] = [];
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      claimForAnalysis: vi.fn(() => {
        callOrder.push("claim");
        return Promise.resolve({ claimed: true, token: "tok" });
      }),
      runAnalysis: vi.fn(() => {
        callOrder.push("analyze");
        return Promise.resolve({
          ok: true,
          score: 75,
          model: "m",
          provider: "p",
          durationMs: 50,
          result: {} as never,
          prompt: "p",
          stats: stubStats,
        } as AnalysisOutcome);
      }),
    });
    const svc = createAutoAnalyze(deps);

    await svc.runTick();
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
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() =>
        Promise.resolve({
          ok: true,
          score: 80,
          model: "m",
          provider: "p",
          durationMs: 50,
          result: {} as never,
          prompt: "p",
          stats: stubStats,
        } as AnalysisOutcome),
      ),
    });
    const svc = createAutoAnalyze(deps);

    await svc.runTick();
    await new Promise((r) => setTimeout(r, 10));

    expect(deps.releaseAnalysisClaim).not.toHaveBeenCalled();
  });

  test("swallows notification failures after a successful analysis", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      sendEmail: vi.fn(() => Promise.reject(new Error("dove down"))),
    });
    const svc = createAutoAnalyze(deps);
    await svc.runTick();
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  test("swallows non-Error notification failures", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      sendEmail: vi.fn(() => Promise.reject("dove string")),
    });
    await createAutoAnalyze(deps).runTick();
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  test("keeps a replacement task when the original work finishes", async () => {
    let now = 1000;
    let resolveFirst: ((v: AnalysisOutcome) => void) | null = null;
    let callCount = 0;
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<AnalysisOutcome>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return new Promise<AnalysisOutcome>(() => {});
      }),
      nowFn: () => now,
    });
    const svc = createAutoAnalyze(deps, { staleThresholdMs: 5000 });
    const first = svc.runTick();
    await new Promise((r) => setTimeout(r, 10));
    now = 7000;
    void svc.runTick();
    await new Promise((r) => setTimeout(r, 10));
    const replacementStartedAt = svc.getRunningTasks().get("u1")!.startedAt;
    resolveFirst!({
      ok: true,
      score: 80,
      model: "m",
      provider: "p",
      durationMs: 50,
      result: {} as never,
      prompt: "p",
      stats: stubStats,
    });
    await first;
    expect(svc.getRunningTasks().get("u1")!.startedAt).toBe(replacementStartedAt);
  });

  test("still fails the tick when claim release throws", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() => Promise.reject(new Error("network failure"))),
      releaseAnalysisClaim: vi.fn(() => Promise.reject(new Error("lease fail"))),
    });
    await expect(createAutoAnalyze(deps).runTick()).rejects.toThrow(
      "auto-analyze failed for 1 user(s)",
    );
    expect(deps.releaseAnalysisClaim).toHaveBeenCalledTimes(1);
  });

  test("releases claim when analysis returns ok=false", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() =>
        Promise.resolve({
          ok: false,
          reason: "ai_error",
          message: "provider timeout",
        } as AnalysisOutcome),
      ),
    });
    const svc = createAutoAnalyze(deps);

    await expect(svc.runTick()).rejects.toThrow("auto-analyze failed for 1 user(s)");

    expect(deps.releaseAnalysisClaim).toHaveBeenCalledTimes(1);
  });

  test("releases claim when analysis throws unexpected error", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() => Promise.reject(new Error("network failure"))),
    });
    const svc = createAutoAnalyze(deps);

    await expect(svc.runTick()).rejects.toThrow("auto-analyze failed for 1 user(s)");

    expect(deps.releaseAnalysisClaim).toHaveBeenCalledTimes(1);
  });

  test("logs non-Error rejection from runAnalysis via the `: err` fallback", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(() => Promise.reject("string failure")),
    });
    const svc = createAutoAnalyze(deps);

    await expect(svc.runTick()).rejects.toThrow("auto-analyze failed for 1 user(s)");

    expect(deps.releaseAnalysisClaim).toHaveBeenCalledTimes(1);
  });

  test("logs non-Error throw from findAutoSummarizeUsers via the `: err` fallback", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.reject("db down")),
    });
    const svc = createAutoAnalyze(deps);
    await expect(svc.runTick()).rejects.toBe("db down");
    expect(deps.claimForAnalysis).not.toHaveBeenCalled();
  });

  test("logs non-Error throw from per-user processing via the `: err` fallback", async () => {
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1", "u2"])),
      getUserTimezone: vi.fn((userId: string) => {
        if (userId === "u1") return Promise.reject("non-error tz failure");
        return Promise.resolve("Asia/Shanghai");
      }),
      hasSessions: vi.fn(() => Promise.resolve(false)),
    });
    const svc = createAutoAnalyze(deps);
    await expect(svc.runTick()).rejects.toThrow("auto-analyze failed for 1 user(s)");
    expect(deps.hasSessions).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getRunningTasks
// ---------------------------------------------------------------------------

describe("getRunningTasks()", () => {
  test("returns current state without promise", async () => {
    let resolveAnalysis: ((v: AnalysisOutcome) => void) | null = null;
    const deps = makeDeps({
      findAutoSummarizeUsers: vi.fn(() => Promise.resolve(["u1"])),
      hasSessions: vi.fn(() => Promise.resolve(true)),
      hasAnalysis: vi.fn(() => Promise.resolve(false)),
      runAnalysis: vi.fn(
        () =>
          new Promise<AnalysisOutcome>((resolve) => {
            resolveAnalysis = resolve;
          }),
      ),
      nowFn: () => 42000,
    });
    const svc = createAutoAnalyze(deps);

    const _tick = svc.runTick();
    await new Promise((r) => setTimeout(r, 10));

    const tasks = svc.getRunningTasks();
    expect(tasks.size).toBe(1);
    const task = tasks.get("u1");
    expect(task).toBeDefined();
    expect(task!.userId).toBe("u1");
    expect(task!.startedAt).toBe(42000);
    // Verify promise is NOT exposed
    expect((task as Record<string, unknown>).promise).toBeUndefined();

    // Cleanup
    resolveAnalysis!({
      ok: true,
      score: 80,
      model: "m",
      provider: "p",
      durationMs: 50,
      result: {} as never,
      prompt: "p",
      stats: stubStats,
    });
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
});
