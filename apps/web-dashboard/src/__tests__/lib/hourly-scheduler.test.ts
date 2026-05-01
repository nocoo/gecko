/**
 * Tests for lib/hourly-scheduler.ts — generic hourly timer.
 * Target: ≥95% coverage.
 */

import { describe, test, expect, afterEach, vi } from "vitest";
import {
  createHourlyScheduler,
  getHourlyScheduler,
  resetHourlyScheduler,
} from "@/lib/hourly-scheduler";

afterEach(() => {
  resetHourlyScheduler();
});

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("HourlyScheduler constructor", () => {
  test("starts interval when autoStart=true (default)", () => {
    const s = createHourlyScheduler();
    expect(s.getStats().running).toBe(true);
    s.shutdown();
  });

  test("skips interval when autoStart=false", () => {
    const s = createHourlyScheduler({ autoStart: false });
    expect(s.getStats().running).toBe(false);
  });

  test("setInterval callback fires void this.tick() when interval elapses", async () => {
    let ticked = 0;
    const s = createHourlyScheduler({ intervalMs: 5 });
    s.on(() => {
      ticked++;
    });
    await new Promise((r) => setTimeout(r, 30));
    s.shutdown();
    expect(ticked).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// on() + unsubscribe
// ---------------------------------------------------------------------------

describe("on()", () => {
  test("registers listener, returns unsubscribe fn", async () => {
    const s = createHourlyScheduler({ autoStart: false });
    const fn = vi.fn(() => {});
    const unsub = s.on(fn);

    await s.tick();
    expect(fn).toHaveBeenCalledTimes(1);

    unsub();
    await s.tick();
    expect(fn).toHaveBeenCalledTimes(1); // not called again
  });

  test("unsubscribe removes listener from set", () => {
    const s = createHourlyScheduler({ autoStart: false });
    const fn = vi.fn(() => {});
    const unsub = s.on(fn);

    expect(s.getStats().listenerCount).toBe(1);
    unsub();
    expect(s.getStats().listenerCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// tick()
// ---------------------------------------------------------------------------

describe("tick()", () => {
  test("calls all listeners sequentially", async () => {
    const s = createHourlyScheduler({ autoStart: false });
    const order: number[] = [];

    s.on(async () => {
      order.push(1);
    });
    s.on(async () => {
      order.push(2);
    });

    await s.tick();
    expect(order).toEqual([1, 2]);
  });

  test("catches per-listener errors, continues to next", async () => {
    const s = createHourlyScheduler({ autoStart: false });
    const fn1 = vi.fn(() => {
      throw new Error("boom");
    });
    const fn2 = vi.fn(() => {});

    s.on(fn1);
    s.on(fn2);

    await s.tick(); // should not throw
    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  test("logs non-Error rejections via the `: err` fallback branch", async () => {
    const s = createHourlyScheduler({ autoStart: false });
    s.on(() => {
      throw "string failure";
    });
    await s.tick();
  });

  test("skips when already ticking (re-entrancy guard)", async () => {
    const s = createHourlyScheduler({ autoStart: false });
    let callCount = 0;
    let resolveBlock: (() => void) | null = null;

    s.on(() => {
      callCount++;
      if (callCount === 1) {
        // First call: block until we release
        return new Promise<void>((resolve) => {
          resolveBlock = resolve;
        });
      }
    });

    // Start first tick (will block)
    const tick1 = s.tick();

    // Second tick while first is in progress — should be skipped
    await s.tick();

    // Release the first tick
    resolveBlock!();
    await tick1;

    expect(callCount).toBe(1); // only called once
  });

  test("handles sync callbacks", async () => {
    const s = createHourlyScheduler({ autoStart: false });
    const fn = vi.fn(() => {
      // sync callback, no return value
    });
    s.on(fn);

    await s.tick();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// shutdown()
// ---------------------------------------------------------------------------

describe("shutdown()", () => {
  test("clears interval and marks as not running", () => {
    const s = createHourlyScheduler();
    expect(s.getStats().running).toBe(true);

    s.shutdown();
    expect(s.getStats().running).toBe(false);
  });

  test("is safe to call multiple times", () => {
    const s = createHourlyScheduler();
    s.shutdown();
    s.shutdown(); // should not throw
    expect(s.getStats().running).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getStats()
// ---------------------------------------------------------------------------

describe("getStats()", () => {
  test("returns running + listenerCount", () => {
    const s = createHourlyScheduler({ autoStart: false });
    s.on(() => {});
    s.on(() => {});

    const stats = s.getStats();
    expect(stats.running).toBe(false);
    expect(stats.listenerCount).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Factory + singleton
// ---------------------------------------------------------------------------

describe("factory", () => {
  test("creates independent instances", () => {
    const a = createHourlyScheduler({ autoStart: false });
    const b = createHourlyScheduler({ autoStart: false });
    expect(a).not.toBe(b);
  });
});

describe("singleton", () => {
  test("returns same instance on repeated calls", () => {
    const a = getHourlyScheduler();
    const b = getHourlyScheduler();
    expect(a).toBe(b);
    a.shutdown();
  });

  test("resetHourlyScheduler shuts down and nulls", () => {
    const a = getHourlyScheduler();
    expect(a.getStats().running).toBe(true);

    resetHourlyScheduler();

    // New call creates a fresh instance
    const b = getHourlyScheduler();
    expect(b).not.toBe(a);
    b.shutdown();
  });
});
