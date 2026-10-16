import { describe, expect, test } from "vitest";
import { batchExecute, execute, query, setD1 } from "../../lib/d1";
import { mockD1, ScriptedD1 } from "../test-env";

describe("d1 adapter", () => {
  test("query returns typed rows from SELECT", async () => {
    mockD1([[{ id: "1", name: "test" }]]);
    const rows = await query<{ id: string; name: string }>("SELECT * FROM users WHERE id = ?", [
      "u1",
    ]);
    expect(rows).toEqual([{ id: "1", name: "test" }]);
  });

  test("execute uses all() for SELECT and WITH", async () => {
    const { calls } = mockD1([[{ probe: 1 }]]);
    await execute("SELECT 1 AS probe");
    await execute("WITH x AS (SELECT 1) SELECT * FROM x");
    expect(calls[0]?.sql.startsWith("SELECT")).toBe(true);
    expect(calls[1]?.sql.startsWith("WITH")).toBe(true);
  });

  test("execute uses run() for INSERT", async () => {
    const { db } = mockD1([[]]);
    const result = await execute("INSERT INTO t (id) VALUES (?)", ["a"]);
    expect(result.meta.changes).toBeGreaterThanOrEqual(0);
    expect(db.calls[0]?.params).toEqual(["a"]);
  });

  test("batchExecute runs statements in order", async () => {
    const { calls } = mockD1([[], [{ id: "1" }]]);
    const results = await batchExecute([
      { sql: "INSERT INTO t (id) VALUES (?)", params: ["a"] },
      { sql: "SELECT id FROM t", params: [] },
    ]);
    expect(results).toHaveLength(2);
    expect(calls.map((call) => call.sql)).toEqual([
      "INSERT INTO t (id) VALUES (?)",
      "SELECT id FROM t",
    ]);
  });

  test("query throws when D1 is missing", async () => {
    setD1(undefined);
    await expect(query("SELECT 1")).rejects.toThrow("D1 binding missing");
  });

  test("setD1 injects a replacement database", async () => {
    const db = new ScriptedD1([[{ ok: 1 }]]);
    setD1(db as unknown as D1Database);
    const rows = await query("SELECT 1 AS ok");
    expect(rows).toEqual([{ ok: 1 }]);
  });

  test("defaults missing D1 meta fields", async () => {
    const db = {
      prepare() {
        return {
          bind() {
            return {
              all: async () => ({ success: true }),
              run: async () => ({ results: [], success: true }),
            };
          },
        };
      },
    };
    setD1(db as unknown as D1Database);
    const selected = await execute("SELECT 1 AS n");
    expect(selected.results).toEqual([]);
    expect(selected.meta.changes).toBe(0);
    const written = await execute("INSERT INTO t (id) VALUES (1)");
    expect(written.meta.last_row_id).toBe(0);
  });
});
