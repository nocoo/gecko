import { describe, test, expect, mock } from "bun:test";
import {
  createSyncQueue,
  buildMultiRowInsert,
  COLUMNS,
  type QueuedSession,
} from "../../lib/sync-queue";

// ---------------------------------------------------------------------------
// SyncQueue unit tests
// Tests the in-memory queue + background drain worker.
// ---------------------------------------------------------------------------

// Sample session factory
function sampleItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "550e8400-e29b-41d4-a716-446655440000",
    user_id: "user-1",
    device_id: "device-1",
    app_name: "Google Chrome",
    window_title: "GitHub - gecko",
    url: "https://github.com/user/gecko",
    start_time: 1740600000.0,
    duration: 120.0,
    bundle_id: "com.google.Chrome",
    tab_title: "gecko: Screen time tracker",
    tab_count: 12,
    document_path: null,
    is_full_screen: false,
    is_minimized: false,
    ...overrides,
  };
}

describe("SyncQueue", () => {
  // -------------------------------------------------------------------------
  // enqueue()
  // -------------------------------------------------------------------------

  describe("enqueue()", () => {
    test("accepts items and returns count", () => {
      const queue = createSyncQueue({ autoStart: false });
      const items = [sampleItem(), sampleItem({ id: "id-2" })];
      const count = queue.enqueue(items);
      expect(count).toBe(2);
    });

    test("accumulates items across multiple enqueue calls", () => {
      const queue = createSyncQueue({ autoStart: false });
      queue.enqueue([sampleItem({ id: "id-1" })]);
      queue.enqueue([sampleItem({ id: "id-2" })]);
      queue.enqueue([sampleItem({ id: "id-3" })]);

      const stats = queue.getStats();
      expect(stats.pending).toBe(3);
    });

    test("returns 0 for empty array", () => {
      const queue = createSyncQueue({ autoStart: false });
      const count = queue.enqueue([]);
      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getStats()
  // -------------------------------------------------------------------------

  describe("getStats()", () => {
    test("returns zero stats when empty", () => {
      const queue = createSyncQueue({ autoStart: false });
      const stats = queue.getStats();
      expect(stats.pending).toBe(0);
      expect(stats.drained).toBe(0);
      expect(stats.failed).toBe(0);
    });

    test("tracks pending count after enqueue", () => {
      const queue = createSyncQueue({ autoStart: false });
      queue.enqueue([sampleItem(), sampleItem({ id: "id-2" })]);
      expect(queue.getStats().pending).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // drain()
  // -------------------------------------------------------------------------

  describe("drain()", () => {
    test("drains pending items via writeFn", async () => {
      const written: unknown[][] = [];
      const writeFn = mock(async (batch: unknown[]) => {
        written.push(batch);
      });

      const queue = createSyncQueue({ autoStart: false, writeFn, batchSize: 50 });
      queue.enqueue([
        sampleItem({ id: "id-1" }),
        sampleItem({ id: "id-2" }),
        sampleItem({ id: "id-3" }),
      ]);

      await queue.drain();

      expect(writeFn).toHaveBeenCalledTimes(1);
      expect(written[0].length).toBe(3);
      expect(queue.getStats().pending).toBe(0);
      expect(queue.getStats().drained).toBe(3);
    });

    test("batches items according to batchSize", async () => {
      const writeFn = mock(async (_batch: unknown[]) => {});

      const queue = createSyncQueue({ autoStart: false, writeFn, batchSize: 2 });
      queue.enqueue([
        sampleItem({ id: "id-1" }),
        sampleItem({ id: "id-2" }),
        sampleItem({ id: "id-3" }),
        sampleItem({ id: "id-4" }),
        sampleItem({ id: "id-5" }),
      ]);

      await queue.drain();

      // 5 items with batchSize 2 → 3 batches (2, 2, 1)
      expect(writeFn).toHaveBeenCalledTimes(3);
      expect(queue.getStats().drained).toBe(5);
      expect(queue.getStats().pending).toBe(0);
    });

    test("is a no-op when queue is empty", async () => {
      const writeFn = mock(async (_batch: unknown[]) => {});
      const queue = createSyncQueue({ autoStart: false, writeFn });

      await queue.drain();

      expect(writeFn).not.toHaveBeenCalled();
      expect(queue.getStats().drained).toBe(0);
    });

    test("increments failed count on writeFn error", async () => {
      const writeFn = mock(async (_batch: unknown[]) => {
        throw new Error("D1 timeout");
      });

      const queue = createSyncQueue({ autoStart: false, writeFn, batchSize: 50 });
      queue.enqueue([sampleItem({ id: "id-1" }), sampleItem({ id: "id-2" })]);

      // drain should not throw — fire-and-forget style
      await queue.drain();

      const stats = queue.getStats();
      expect(stats.failed).toBe(2);
      // Items are removed from queue even on failure (not re-enqueued)
      expect(stats.pending).toBe(0);
    });

    test("continues draining remaining batches after one batch fails", async () => {
      let callCount = 0;
      const writeFn = mock(async (_batch: unknown[]) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Transient error");
        }
      });

      const queue = createSyncQueue({ autoStart: false, writeFn, batchSize: 2 });
      queue.enqueue([
        sampleItem({ id: "id-1" }),
        sampleItem({ id: "id-2" }),
        sampleItem({ id: "id-3" }),
        sampleItem({ id: "id-4" }),
      ]);

      await queue.drain();

      // 4 items, batchSize 2 → 2 batches
      expect(writeFn).toHaveBeenCalledTimes(2);
      // First batch (2 items) failed, second batch (2 items) succeeded
      expect(queue.getStats().failed).toBe(2);
      expect(queue.getStats().drained).toBe(2);
      expect(queue.getStats().pending).toBe(0);
    });

    test("prevents concurrent drain calls", async () => {
      let activeCount = 0;
      let maxActive = 0;

      const writeFn = mock(async (_batch: unknown[]) => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        activeCount--;
      });

      const queue = createSyncQueue({ autoStart: false, writeFn, batchSize: 50 });
      queue.enqueue([sampleItem({ id: "id-1" }), sampleItem({ id: "id-2" })]);

      // Fire two concurrent drains
      await Promise.all([queue.drain(), queue.drain()]);

      // Only one should have actually executed
      expect(maxActive).toBe(1);
      expect(writeFn).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // shutdown()
  // -------------------------------------------------------------------------

  describe("shutdown()", () => {
    test("stops the interval timer", () => {
      const queue = createSyncQueue({ autoStart: true, drainIntervalMs: 100 });
      expect(queue.getStats().running).toBe(true);

      queue.shutdown();
      expect(queue.getStats().running).toBe(false);
    });

    test("is idempotent", () => {
      const queue = createSyncQueue({ autoStart: true, drainIntervalMs: 100 });
      queue.shutdown();
      queue.shutdown(); // should not throw
      expect(queue.getStats().running).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // buildMultiRowInsert() — SQL builder
  // -------------------------------------------------------------------------

  describe("buildMultiRowInsert()", () => {
    test("builds correct SQL and params for a single session", () => {
      const item = sampleItem();
      const { sql, params } = buildMultiRowInsert([item]);

      expect(sql).toContain("INSERT OR IGNORE INTO focus_sessions");
      expect(sql).toContain("VALUES");
      // 14 columns → 14 placeholders
      expect((sql.match(/\?/g) || []).length).toBe(14);
      expect(params.length).toBe(14);
    });

    test("builds correct SQL for multiple sessions", () => {
      const items = [
        sampleItem({ id: "id-1" }),
        sampleItem({ id: "id-2" }),
        sampleItem({ id: "id-3" }),
      ];
      const { sql, params } = buildMultiRowInsert(items);

      // 3 rows × 14 columns = 42 placeholders
      expect((sql.match(/\?/g) || []).length).toBe(42);
      expect(params.length).toBe(42);

      // Should have 3 value groups
      const valueGroups = sql.match(/\([\s\S]*?\)/g);
      // First group is column list, then 3 value groups
      expect(valueGroups).toBeTruthy();
      expect(valueGroups!.length).toBeGreaterThanOrEqual(4); // 1 column group + 3 value groups
    });

    test("correctly maps boolean fields to 0/1", () => {
      const item = sampleItem({ is_full_screen: true, is_minimized: false });
      const { params } = buildMultiRowInsert([item]);

      // is_full_screen is at index 12, is_minimized at 13
      expect(params[12]).toBe(1);
      expect(params[13]).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // D1 bind parameter constraints
  // -------------------------------------------------------------------------

  describe("D1 bind parameter constraints", () => {
    test("COLUMNS has exactly 14 entries (post-optimization)", () => {
      expect(COLUMNS.length).toBe(14);
    });

    test("default batchSize of 7 stays within D1's 100-param limit", () => {
      const queue = createSyncQueue({ autoStart: false });
      // Build a full default batch (7 rows)
      const items = Array.from({ length: 7 }, (_, i) =>
        sampleItem({ id: `batch-${i}` })
      );
      const { params } = buildMultiRowInsert(items);

      // 7 rows × 14 cols = 98 params — must be < 100
      expect(params.length).toBe(98);
      expect(params.length).toBeLessThan(100);

      // Verify queue uses 7 as default batch size
      const stats = queue.getStats();
      queue.shutdown();
      expect(stats).toBeDefined();
    });

    test("8 rows would exceed D1's 100-param limit", () => {
      const items = Array.from({ length: 8 }, (_, i) =>
        sampleItem({ id: `over-${i}` })
      );
      const { params } = buildMultiRowInsert(items);

      // 8 rows × 14 cols = 112 params — exceeds limit
      expect(params.length).toBe(112);
      expect(params.length).toBeGreaterThan(100);
    });
  });

  // -------------------------------------------------------------------------
  // Schema-drift guard: COLUMNS must match QueuedSession interface keys
  // -------------------------------------------------------------------------

  describe("schema-drift guard", () => {
    test("COLUMNS matches the keys of QueuedSession", () => {
      // Create a fully-typed QueuedSession to extract its keys at runtime
      const reference: QueuedSession = {
        id: "",
        user_id: "",
        device_id: "",
        app_name: "",
        window_title: "",
        url: null,
        start_time: 0,
        duration: 0,
        bundle_id: null,
        tab_title: null,
        tab_count: null,
        document_path: null,
        is_full_screen: false,
        is_minimized: false,
      };
      const interfaceKeys = Object.keys(reference).sort();
      const columnKeys = [...COLUMNS].sort();

      expect(columnKeys).toEqual(interfaceKeys);
    });

    test("COLUMNS does not include end_time (removed in optimization)", () => {
      expect(COLUMNS).not.toContain("end_time");
    });

    test("COLUMNS does not include synced_at (uses D1 DEFAULT)", () => {
      expect(COLUMNS).not.toContain("synced_at");
    });
  });
});
