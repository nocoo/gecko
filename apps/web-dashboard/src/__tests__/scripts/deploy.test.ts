import { describe, expect, test } from "vitest";
import { historicalSnapshot, inspectBaseline } from "../../../scripts/baseline-d1";
import { FORWARD_MIGRATION, HISTORICAL_MIGRATIONS } from "../../../scripts/cutover-schema";
import {
  assertPendingSafe,
  main,
  memoryDeployAdapter,
  pendingMigrations,
  runDeploy,
} from "../../../scripts/deploy";
import { PRODUCTION_DB_ID } from "../../../scripts/worker-stage";

const files = [...HISTORICAL_MIGRATIONS, FORWARD_MIGRATION];

function readyLedger() {
  const ledger = inspectBaseline(historicalSnapshot()).ledger;
  if (!ledger) throw new Error("expected historical ledger");
  return ledger;
}

function argv(stage: string, extra: string[] = []): string[] {
  return ["--stage", stage, "--database-id", PRODUCTION_DB_ID, ...extra];
}

describe("deploy", () => {
  test("full baseline leaves only 0009 pending and rejects destructive leftovers", () => {
    const ledger = readyLedger();
    expect(pendingMigrations(files, ledger)).toEqual([FORWARD_MIGRATION]);
    expect(() => assertPendingSafe(["0002_slim_columns.sql"])).toThrow(/destructive/);
    expect(() => assertPendingSafe(["0004_settings.sql"])).toThrow(/unexpected/);
    assertPendingSafe([FORWARD_MIGRATION]);
  });

  test("dry-run prep, http, and cron each emit an explicit triggers array", async () => {
    const { adapter } = memoryDeployAdapter({ remote: [{ cron: "0 * * * *" }] });
    const ledger = readyLedger();
    const prep = await runDeploy(argv("prep"), { adapter, ledger, migrationFiles: files });
    expect(prep.dryRun).toBe(true);
    expect(prep.deployedId).toBeNull();
    expect(Object.hasOwn(prep.config, "triggers")).toBe(true);
    expect(prep.config.triggers).toEqual([]);
    expect(prep.config.domains).toBeUndefined();
    expect(prep.remoteTriggers).toEqual([]);

    const http = await runDeploy(argv("http"), { adapter, ledger, migrationFiles: files });
    expect(http.config.domains).toEqual(["gecko.hexly.ai"]);
    expect(http.config.triggers).toEqual([]);

    const cron = await runDeploy(argv("cron"), { adapter, ledger, migrationFiles: files });
    expect(cron.config.triggers).toEqual([{ cron: "0 * * * *" }]);
  });

  test("generated config that omits triggers is rejected", async () => {
    const { adapter } = memoryDeployAdapter({ omitTriggers: true });
    await expect(
      runDeploy(argv("prep"), { adapter, ledger: readyLedger(), migrationFiles: files }),
    ).rejects.toThrow(/omitted triggers/);
  });

  test("apply refuses test env, missing approval, and http without silence", async () => {
    const { adapter } = memoryDeployAdapter();
    const ledger = readyLedger();
    await expect(
      runDeploy(argv("prep"), {
        adapter,
        ledger,
        migrationFiles: files,
        env: { GECKO_TEST_STATE: "x" },
      }),
    ).rejects.toThrow(/GECKO_TEST_STATE/);
    await expect(
      runDeploy(["--stage", "prep"], { adapter, ledger, migrationFiles: files }),
    ).rejects.toThrow(/database-id/);
    await expect(
      runDeploy(argv("prep", ["--apply"]), { adapter, ledger, migrationFiles: files }),
    ).rejects.toThrow(/approve gecko-deploy-prep/);
    await expect(
      runDeploy(argv("http", ["--apply", "--approve", "gecko-deploy-http"]), {
        adapter,
        ledger,
        migrationFiles: files,
      }),
    ).rejects.toThrow(/silence-confirmed/);
  });

  test("authorized prep apply clears leftover remote Cron", async () => {
    const { adapter, state } = memoryDeployAdapter({ remote: [{ cron: "0 * * * *" }] });
    const report = await runDeploy(argv("prep", ["--apply", "--approve", "gecko-deploy-prep"]), {
      adapter,
      ledger: readyLedger(),
      migrationFiles: files,
    });
    expect(report.dryRun).toBe(false);
    expect(report.deployedId).toBe("deploy-1");
    expect(state.remote).toEqual([]);
    expect(state.pending).toEqual([]);
    expect(report.pending).toEqual([FORWARD_MIGRATION]);
  });

  test("http apply after silence confirmation keeps Cron empty", async () => {
    const { adapter, state } = memoryDeployAdapter({ remote: [] });
    const report = await runDeploy(
      argv("http", ["--apply", "--approve", "gecko-deploy-http", "--silence-confirmed"]),
      { adapter, ledger: readyLedger(), migrationFiles: files },
    );
    expect(report.config.domains).toEqual(["gecko.hexly.ai"]);
    expect(state.remote).toEqual([]);
    expect(state.pending).toEqual([FORWARD_MIGRATION]);
  });

  test("analyzing-with-result rows and 0009-as-historical ledgers are blocked", async () => {
    const { adapter } = memoryDeployAdapter();
    await expect(
      runDeploy(argv("prep"), {
        adapter,
        ledger: readyLedger(),
        migrationFiles: files,
        analyzingWithResult: 1,
      }),
    ).rejects.toThrow(/__analyzing__/);
    const bad = { ...readyLedger(), historical: [...readyLedger().historical, FORWARD_MIGRATION] };
    await expect(
      runDeploy(argv("prep"), { adapter, ledger: bad, migrationFiles: files }),
    ).rejects.toThrow(/0009 as historical/);
  });

  test("main without an injected adapter refuses implicit production deploy", async () => {
    await expect(main([])).rejects.toThrow(/injected adapter/);
  });

  test("main with deps dry-runs and incomplete or local ledgers are blocked", async () => {
    const { adapter, state } = memoryDeployAdapter({ remote: [] });
    const ledger = readyLedger();
    const report = await main(argv("prep"), { adapter, ledger, migrationFiles: files });
    expect(report.dryRun).toBe(true);
    await expect(
      runDeploy(argv("prep"), {
        adapter,
        ledger: { ...ledger, databaseId: "other" },
        migrationFiles: files,
      }),
    ).rejects.toThrow(/production baseline ledger/);
    await expect(
      runDeploy(argv("prep"), {
        adapter,
        ledger: { ...ledger, historical: ledger.historical.slice(0, 7) },
        migrationFiles: files,
      }),
    ).rejects.toThrow(/proven 0001-0008/);
    await expect(
      runDeploy(argv("prep"), {
        adapter,
        ledger,
        migrationFiles: files,
        env: { RESOURCE_ENV: "local" },
      }),
    ).rejects.toThrow(/RESOURCE_ENV=local/);
    const applied = await runDeploy(
      argv("cron", ["--apply", "--approve", "gecko-deploy-cron", "--silence-confirmed"]),
      {
        adapter,
        ledger: { ...ledger, forwardApplied: [FORWARD_MIGRATION] },
        migrationFiles: files,
      },
    );
    expect(applied.config.triggers).toEqual([{ cron: "0 * * * *" }]);
    expect(state.pending).toEqual([]);
  });
});
