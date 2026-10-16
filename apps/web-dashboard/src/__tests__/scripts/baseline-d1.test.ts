import { describe, expect, test } from "vitest";
import {
  type BaselineLedger,
  type D1Snapshot,
  emptySnapshot,
  historicalSnapshot,
  inspectBaseline,
  main,
  provenHistoricalMigrations,
  runBaseline,
} from "../../../scripts/baseline-d1";
import {
  FORWARD_MIGRATION,
  HISTORICAL_MIGRATIONS,
  isUserIdTable,
} from "../../../scripts/cutover-schema";
import { PRODUCTION_ACCOUNT_ID, PRODUCTION_DB_ID } from "../../../scripts/worker-stage";

function ledgerWriter() {
  const written: BaselineLedger[] = [];
  return {
    written,
    store: {
      inspect: async () => historicalSnapshot(),
      writeLedger: async (ledger: BaselineLedger) => {
        written.push(ledger);
      },
    },
  };
}

describe("baseline-d1", () => {
  test("empty schema cannot register historical migrations", () => {
    const report = inspectBaseline(emptySnapshot());
    expect(report.ok).toBe(false);
    expect(report.provenHistorical).toEqual([]);
    expect(report.missingHistorical).toEqual([...HISTORICAL_MIGRATIONS]);
    expect(report.ledger).toBeNull();
  });

  test("reconstructed 0001-0008 schema is proven and never registers 0009 as historical", () => {
    const report = inspectBaseline(historicalSnapshot());
    expect(report.ok).toBe(true);
    expect(report.provenHistorical).toEqual([...HISTORICAL_MIGRATIONS]);
    expect(report.forwardPresent).toBe(false);
    expect(report.ledger?.historical).not.toContain(FORWARD_MIGRATION);
    expect(provenHistoricalMigrations(historicalSnapshot())).toHaveLength(8);
  });

  test("claim columns mark 0009 as already-applied forward, not historical", () => {
    const snapshot = historicalSnapshot();
    const summaries = snapshot.tables.find((table) => table.name === "daily_summaries");
    summaries?.columns.push("claim_token", "claim_expires_at");
    const report = inspectBaseline(snapshot);
    expect(report.ok).toBe(true);
    expect(report.forwardPresent).toBe(true);
    expect(report.ledger?.forwardApplied).toEqual([FORWARD_MIGRATION]);
    expect(report.ledger?.historical).not.toContain(FORWARD_MIGRATION);
  });

  test("extra user_id tables and analyzing-with-result rows block the baseline", () => {
    const extra: D1Snapshot = historicalSnapshot({
      tables: [
        ...historicalSnapshot().tables,
        {
          name: "mystery",
          columns: ["user_id"],
          sql: "CREATE TABLE mystery (user_id TEXT)",
          rowCount: 1,
        },
      ],
    });
    expect(inspectBaseline(extra).ok).toBe(false);
    expect(inspectBaseline(extra).extraUserIdTables).toEqual(["mystery"]);
    expect(
      inspectBaseline(historicalSnapshot({ analyzingWithResult: 2 })).blocked.join(" "),
    ).toMatch(/__analyzing__/);
    expect(isUserIdTable("focus_sessions")).toBe(true);
    expect(isUserIdTable("mystery")).toBe(false);
  });

  test("default inspect does not write a ledger", async () => {
    const { store, written } = ledgerWriter();
    const report = await runBaseline([], { store });
    expect(report.ok).toBe(true);
    expect(written).toHaveLength(0);
  });

  test("production apply requires approval, explicit database id, and matching account", async () => {
    const { store, written } = ledgerWriter();
    await expect(runBaseline(["--apply"], { store })).rejects.toThrow(/approve gecko-baseline/);
    await expect(
      runBaseline(["--apply", "--approve", "gecko-baseline"], { store }),
    ).rejects.toThrow(/database-id/);
    const report = await runBaseline(
      ["--apply", "--approve", "gecko-baseline", "--database-id", PRODUCTION_DB_ID],
      { store },
    );
    expect(report.ok).toBe(true);
    expect(written[0]?.accountId).toBe(PRODUCTION_ACCOUNT_ID);
    expect(written[0]?.historical).toEqual([...HISTORICAL_MIGRATIONS]);
  });

  test("local apply uses the local approval token", async () => {
    const written: BaselineLedger[] = [];
    const snapshot = historicalSnapshot({
      databaseId: "aaaaaaaa-0000-4000-8000-000000000001",
      accountId: "local",
      databaseName: "gecko-local",
    });
    const report = await runBaseline(["--apply", "--approve", "gecko-baseline-local"], {
      store: {
        inspect: async () => snapshot,
        writeLedger: async (ledger) => {
          written.push(ledger);
        },
      },
    });
    expect(report.ok).toBe(true);
    expect(written).toHaveLength(1);
  });

  test("test process env is refused and incomplete historical schema cannot be applied", async () => {
    await expect(
      runBaseline([], {
        store: { inspect: async () => emptySnapshot() },
        env: { GECKO_TEST_STATE: "x" },
      }),
    ).rejects.toThrow(/GECKO_TEST_STATE/);
    await expect(
      runBaseline(["--apply", "--approve", "gecko-baseline-local"], {
        store: { inspect: async () => emptySnapshot() },
      }),
    ).rejects.toThrow(/baseline blocked/);
  });

  test("main without an injected store refuses implicit remote inspect", async () => {
    await expect(main([])).rejects.toThrow(/injected store/);
  });

  test("main with a store inspects and production apply checks name and account", async () => {
    const { store } = ledgerWriter();
    const report = await main([], {}, store);
    expect(report.ok).toBe(true);
    await expect(
      runBaseline(["--apply", "--approve", "gecko-baseline", "--database-id", PRODUCTION_DB_ID], {
        store: {
          inspect: async () => historicalSnapshot({ accountId: "other-account" }),
        },
      }),
    ).rejects.toThrow(/account id/);
    await expect(
      runBaseline(["--apply", "--approve", "gecko-baseline", "--database-id", PRODUCTION_DB_ID], {
        store: {
          inspect: async () => historicalSnapshot({ databaseName: "other" }),
        },
      }),
    ).rejects.toThrow(/database name/);
    await expect(
      runBaseline(["--apply", "--approve", "gecko-baseline", "--database-id", PRODUCTION_DB_ID], {
        store: { inspect: async () => historicalSnapshot() },
      }),
    ).rejects.toThrow(/ledger writer/);
  });

  test("0001 without slim rebuild does not prove 0002", () => {
    const snapshot = emptySnapshot();
    snapshot.tables = [
      {
        name: "focus_sessions",
        columns: ["id", "user_id", "end_time"],
        sql: "CREATE TABLE focus_sessions (id TEXT, user_id TEXT, end_time REAL NOT NULL)",
        rowCount: 0,
      },
      {
        name: "api_keys",
        columns: ["id", "user_id"],
        sql: "CREATE TABLE api_keys (id TEXT)",
        rowCount: 0,
      },
      {
        name: "sync_logs",
        columns: ["id", "user_id"],
        sql: "CREATE TABLE sync_logs (id TEXT)",
        rowCount: 0,
      },
    ];
    expect(provenHistoricalMigrations(snapshot)).toEqual(["0001_cloud_init.sql"]);
  });
});
