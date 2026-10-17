import { EventEmitter } from "node:events";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import {
  type CfExec,
  createBaselineStore,
  createDeployAdapter,
  createRemapStore,
  d1QueryRows,
  defaultVinextDeploy,
  extractCronTriggers,
  ledgerInsertSql,
  main,
  parseDeployedId,
  parseJsonValue,
  selectColumns,
  writeCutoverReport,
} from "../../../scripts/cutover-cf";
import { FORWARD_MIGRATION, HISTORICAL_MIGRATIONS } from "../../../scripts/cutover-schema";
import { PRODUCTION_DB_ID, PRODUCTION_WORKER } from "../../../scripts/worker-stage";

function queryStdout(rows: unknown[]): string {
  return JSON.stringify([{ results: rows, success: true, meta: {} }]);
}

function sqlArg(args: string[]): string {
  const index = args.indexOf("--sql");
  return index >= 0 ? (args[index + 1] ?? "") : args.join(" ");
}

function execFrom(
  handlers: ((args: string[]) => { stdout: string; stderr?: string; code?: number } | null)[],
): CfExec {
  return async (args) => {
    for (const handler of handlers) {
      const hit = handler(args);
      if (hit) return { stdout: hit.stdout, stderr: hit.stderr ?? "", code: hit.code ?? 0 };
    }
    throw new Error(`unexpected cf ${args.join(" ")}`);
  };
}

const tableSql = {
  focus_sessions:
    "CREATE TABLE focus_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, end_time REAL, synced_at TEXT DEFAULT (datetime('now')))",
  api_keys: "CREATE TABLE api_keys (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)",
  sync_logs: "CREATE TABLE sync_logs (id TEXT PRIMARY KEY, user_id TEXT NOT NULL)",
  categories: "CREATE TABLE categories (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, slug TEXT)",
  app_category_mappings:
    "CREATE TABLE app_category_mappings (user_id TEXT NOT NULL, bundle_id TEXT NOT NULL)",
  tags: "CREATE TABLE tags (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT)",
  app_tag_mappings:
    "CREATE TABLE app_tag_mappings (user_id TEXT NOT NULL, bundle_id TEXT, tag_id TEXT)",
  settings: "CREATE TABLE settings (user_id TEXT NOT NULL, key TEXT NOT NULL)",
  daily_summaries:
    "CREATE TABLE daily_summaries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT, ai_prompt TEXT)",
  app_notes: "CREATE TABLE app_notes (user_id TEXT NOT NULL, bundle_id TEXT)",
};

function inspectExec(): CfExec {
  return execFrom([
    (args) => {
      if (args[1] === "query" && sqlArg(args).includes("type='table'")) {
        return {
          stdout: queryStdout([
            ...Object.entries(tableSql).map(([name, sql]) => ({ name, sql })),
            { name: "_cf_KV", sql: "CREATE TABLE _cf_KV (key TEXT)" },
            { name: "sqlite_sequence", sql: "CREATE TABLE sqlite_sequence(name,seq)" },
            { name: "", sql: "" },
          ]),
        };
      }
      return null;
    },
    (args) => {
      if (args[1] === "query" && sqlArg(args).includes("type='index'")) {
        return {
          stdout: queryStdout([
            { name: "idx_keys_user", tableName: "api_keys", sql: "CREATE INDEX idx_keys_user" },
            { name: "sqlite_autoindex_x", tableName: "api_keys", sql: "" },
          ]),
        };
      }
      return null;
    },
    (args) => {
      const sql = sqlArg(args);
      if (sql.startsWith("PRAGMA table_info(")) {
        const name = sql.slice("PRAGMA table_info(".length, -2);
        if (name === "daily_summaries") {
          return {
            stdout: queryStdout([{ name: "user_id" }, { name: "date" }, { name: "ai_prompt" }]),
          };
        }
        if (name === "focus_sessions") {
          return {
            stdout: queryStdout([{ name: "id" }, { name: "user_id" }, { name: "end_time" }]),
          };
        }
        return { stdout: queryStdout([{ name: "user_id" }]) };
      }
      return null;
    },
    (args) => {
      const sql = sqlArg(args);
      if (sql.includes("__analyzing__")) return { stdout: queryStdout([{ n: "0" }]) };
      if (sql.startsWith("SELECT COUNT(*)")) return { stdout: queryStdout([{ n: "1" }]) };
      return null;
    },
    (args) => {
      const sql = sqlArg(args);
      if (sql.includes("d1_migrations")) {
        return { stdout: "", stderr: "no such table: d1_migrations: SQLITE_ERROR", code: 1 };
      }
      return null;
    },
    (args) => {
      if (args[1] === "time-travel") return { stdout: JSON.stringify({ bookmark: "bookmark-1" }) };
      return null;
    },
    (args) => {
      if (args[0] === "workers" && args[1] === "get") {
        return {
          stdout: "",
          stderr: "[10007] This Worker does not exist on your account.",
          code: 1,
        };
      }
      return null;
    },
  ]);
}

describe("cutover-cf", () => {
  test("parses query JSON, cron triggers, select lists, and ledger SQL", () => {
    expect(d1QueryRows(queryStdout([{ user_id: "a", n: 2 }]))[0]?.user_id).toBe("a");
    expect(d1QueryRows(JSON.stringify({ results: [] }))).toEqual([]);
    expect(d1QueryRows(JSON.stringify({ results: [{ a: null, b: 1 }] }))[0]).toEqual({
      a: "",
      b: "1",
    });
    expect(d1QueryRows(JSON.stringify([null]))).toEqual([]);
    expect(d1QueryRows(JSON.stringify([42]))).toEqual([]);
    expect(d1QueryRows(JSON.stringify({ results: "nope" }))).toEqual([]);
    expect(() => parseJsonValue("nope")).toThrow(/JSON/);
    expect(() => parseJsonValue("[")).toThrow(/invalid/);
    expect(parseJsonValue('prefix {"bookmark":"x"}')).toEqual({ bookmark: "x" });
    const originalParse = JSON.parse;
    JSON.parse = ((text: string) => {
      if (String(text).includes("throw-type")) throw new TypeError("not syntax");
      return originalParse(text);
    }) as typeof JSON.parse;
    try {
      expect(() => parseJsonValue('{"throw-type":true}')).toThrow(/not syntax/);
    } finally {
      JSON.parse = originalParse;
    }
    expect(extractCronTriggers(null)).toEqual([]);
    expect(extractCronTriggers({ cron: "" })).toEqual([]);
    expect(extractCronTriggers([{ cron: "1 * * * *" }])).toEqual([{ cron: "1 * * * *" }]);
    expect(extractCronTriggers({ schedules: [{ cron: "0 * * * *" }] })).toEqual([
      { cron: "0 * * * *" },
    ]);
    expect(selectColumns("settings")).toEqual(["user_id", "key"]);
    expect(ledgerInsertSql(["0001_cloud_init.sql"])).toMatch(
      /CREATE TABLE IF NOT EXISTS d1_migrations/,
    );
    expect(ledgerInsertSql(["0001_cloud_init.sql"])).toContain("0001_cloud_init.sql");
    expect(ledgerInsertSql(["o'reilly.sql"])).toContain("o''reilly.sql");
    expect(parseDeployedId("id 11111111-1111-1111-1111-111111111111 done")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(parseDeployedId("no id")).toBe("deployed");
    const printed: string[] = [];
    writeCutoverReport({ ok: true }, (text) => printed.push(text));
    expect(printed.join("")).toContain('"ok": true');
  });

  test("baseline inspect skips _cf tables and treats missing migration ledger as empty", async () => {
    const store = createBaselineStore(inspectExec(), { cwd: process.cwd(), env: {} });
    const snapshot = await store.inspect();
    expect(snapshot.tables.some((table) => table.name === "_cf_KV")).toBe(false);
    expect(snapshot.tables.some((table) => table.name.startsWith("sqlite_"))).toBe(false);
    expect(snapshot.d1Migrations).toEqual([]);
    expect(snapshot.bookmark).toBe("bookmark-1");
    expect(snapshot.analyzingWithResult).toBe(0);
  });

  test("inspect reads a present ledger, skips failed bookmarks, and strips test env", async () => {
    let seenEnv: NodeJS.ProcessEnv | undefined;
    const exec: CfExec = async (args, options) => {
      seenEnv = options?.env;
      const sql = sqlArg(args);
      if (sql.includes("FROM d1_migrations")) {
        return {
          stdout: queryStdout([{ name: "0001_cloud_init.sql" }]),
          stderr: "",
          code: 0,
        };
      }
      if (args[1] === "time-travel") return { stdout: "", stderr: "missing", code: 1 };
      return inspectExec()(args, options ?? { cwd: process.cwd(), env: {}, timeoutMs: 1 });
    };
    const snapshot = await createBaselineStore(exec, {
      cwd: process.cwd(),
      env: {
        GECKO_TEST_STATE: "x",
        GECKO_RESOURCE_ENV: "test",
        RESOURCE_ENV: "test",
        CF_API_TOKEN: "scoped",
        CF_ACCOUNT_ID: "acct",
        CF_D1_DATABASE_ID: "db",
      },
    }).inspect();
    expect(snapshot.d1Migrations).toEqual(["0001_cloud_init.sql"]);
    expect(snapshot.bookmark).toBeNull();
    expect(seenEnv?.GECKO_TEST_STATE).toBeUndefined();
    expect(seenEnv?.GECKO_RESOURCE_ENV).toBeUndefined();
    expect(seenEnv?.RESOURCE_ENV).toBeUndefined();
    expect(seenEnv?.CF_API_TOKEN).toBeUndefined();
    expect(seenEnv?.CF_ACCOUNT_ID).toBeUndefined();
    expect(seenEnv?.CF_D1_DATABASE_ID).toBeUndefined();
  });

  test("query failures and unexpected migration-ledger errors surface", async () => {
    await expect(
      createBaselineStore(async () => ({ stdout: "", stderr: "boom", code: 1 }), {
        cwd: process.cwd(),
        env: {},
      }).inspect(),
    ).rejects.toThrow(/boom/);
    await expect(
      createBaselineStore(async () => ({ stdout: "", stderr: "", code: 1 }), {
        cwd: process.cwd(),
        env: {},
      }).inspect(),
    ).rejects.toThrow(/d1 query failed/);
    const otherLedger: CfExec = async (args, options) => {
      if (sqlArg(args).includes("FROM d1_migrations")) {
        return { stdout: "", stderr: "permission denied", code: 1 };
      }
      return inspectExec()(args, options ?? { cwd: process.cwd(), env: {}, timeoutMs: 1 });
    };
    await expect(
      createBaselineStore(otherLedger, { cwd: process.cwd(), env: {} }).inspect(),
    ).rejects.toThrow(/permission denied/);
    await expect(
      createBaselineStore(async () => ({ stdout: "", stderr: "ledger boom", code: 1 }), {
        cwd: process.cwd(),
        env: {},
      }).writeLedger({
        databaseId: PRODUCTION_DB_ID,
        accountId: "acct",
        historical: ["0001_cloud_init.sql"],
        forwardApplied: [],
        rowCounts: {},
        bookmark: "b",
      }),
    ).rejects.toThrow(/ledger boom/);
  });

  test("remap store stubs focus_sessions and applies SQL", async () => {
    const applied: string[] = [];
    const exec = execFrom([
      (args) => {
        const sql = args[args.indexOf("--sql") + 1] ?? "";
        if (sql.includes("type='table'")) {
          return {
            stdout: queryStdout([
              { name: "focus_sessions" },
              { name: "settings" },
              { name: "_cf_KV" },
            ]),
          };
        }
        if (sql.startsWith("PRAGMA table_info(focus_sessions)")) {
          return { stdout: queryStdout([{ name: "id" }, { name: "user_id" }]) };
        }
        if (sql.startsWith("PRAGMA table_info(settings)")) {
          return { stdout: queryStdout([{ name: "user_id" }, { name: "key" }]) };
        }
        if (sql.startsWith("PRAGMA table_info(_cf_KV)"))
          return { stdout: queryStdout([{ name: "key" }]) };
        if (sql.includes("GROUP BY user_id")) {
          return { stdout: queryStdout([{ user_id: "old-google-1" }]) };
        }
        if (sql.includes("FROM settings")) {
          return { stdout: queryStdout([{ user_id: "old-google-1", key: "timezone" }]) };
        }
        if (sql.includes("UPDATE") || sql.includes("DELETE")) {
          applied.push(sql);
          return { stdout: queryStdout([]) };
        }
        return null;
      },
    ]);
    const store = createRemapStore(exec, { cwd: process.cwd(), env: {} });
    expect(await store.tablesWithUserId()).toEqual(["focus_sessions", "settings"]);
    expect(await store.loadTable("focus_sessions")).toEqual([
      { user_id: "old-google-1", id: "old-google-1" },
    ]);
    await store.applyStatements(["UPDATE settings SET user_id='a@b.com'"]);
    expect(applied[0]).toContain("UPDATE settings");
    expect(applied[0].trim().endsWith(";")).toBe(true);
    await store.applyStatements(["UPDATE a SET x=1", "DELETE FROM a WHERE x=1;"]);
    expect(
      applied.filter((item) => item.includes("UPDATE a") || item.includes("DELETE FROM a")),
    ).toHaveLength(2);
    await store.applyStatements([]);
    await expect(
      createRemapStore(async () => ({ stdout: "", stderr: "apply fail", code: 1 }), {
        cwd: process.cwd(),
        env: {},
      }).applyStatements(["UPDATE settings SET user_id='a'"]),
    ).rejects.toThrow(/apply fail/);
  });

  test("deploy adapter maps missing workers to empty triggers and deploys", async () => {
    const exec = inspectExec();
    const adapter = createDeployAdapter(exec, async () => ({ id: "deploy-1" }), {
      cwd: process.cwd(),
      env: {},
    });
    expect(await adapter.remoteTriggers()).toEqual([]);
    expect(
      adapter.generateConfig({ CLOUDFLARE_DEPLOY: "production", GECKO_DEPLOY_STAGE: "prep" }).name,
    ).toBe(PRODUCTION_WORKER);
    expect(
      await adapter.deploy(adapter.generateConfig({ CLOUDFLARE_DEPLOY: "production" })),
    ).toEqual({
      id: "deploy-1",
    });
    await adapter.applyMigrations(PRODUCTION_DB_ID, []);
    const stages: string[] = [];
    const staged = createDeployAdapter(
      inspectExec(),
      async (env) => {
        stages.push(env.GECKO_DEPLOY_STAGE ?? "");
        return { id: "staged" };
      },
      { cwd: process.cwd(), env: {} },
    );
    await staged.deploy({ domains: ["gecko.hexly.ai"], triggers: [] } as never);
    await staged.deploy({
      domains: ["gecko.hexly.ai"],
      triggers: [{ cron: "0 * * * *" }],
    } as never);
    expect(stages).toEqual(["http", "cron"]);
    await expect(
      createDeployAdapter(
        async () => ({ stdout: "", stderr: "mig fail", code: 1 }),
        async () => ({ id: "x" }),
        { cwd: process.cwd(), env: {} },
      ).applyMigrations(PRODUCTION_DB_ID, [FORWARD_MIGRATION]),
    ).rejects.toThrow(/mig fail/);
    await expect(
      createDeployAdapter(
        async () => ({ stdout: "", stderr: "rate limit", code: 1 }),
        async () => ({ id: "x" }),
        { cwd: process.cwd(), env: {} },
      ).remoteTriggers(),
    ).rejects.toThrow(/rate limit/);
  });

  test("main runs baseline, remap, deploy, and rejects unknown commands", async () => {
    const exec = inspectExec();
    const baseline = await main(["baseline"], { exec, cwd: process.cwd(), env: {} });
    expect((baseline as { ok: boolean }).ok).toBe(true);
    const remapExec = execFrom([
      (args) => {
        const sql = args[args.indexOf("--sql") + 1] ?? "";
        if (sql.includes("type='table'")) {
          return {
            stdout: queryStdout(Object.keys(tableSql).map((name) => ({ name }))),
          };
        }
        if (sql.startsWith("PRAGMA")) return { stdout: queryStdout([{ name: "user_id" }]) };
        if (sql.includes("GROUP BY user_id") || sql.startsWith("SELECT ")) {
          return { stdout: queryStdout([]) };
        }
        return null;
      },
    ]);
    const remap = await main(["remap", "--allow-merges", "--merge-keep", "first"], {
      exec: remapExec,
      cwd: process.cwd(),
      env: { GECKO_REMAP_JSON: JSON.stringify({ "old-google-1": "architie@gmail.com" }) },
    });
    expect((remap as { ok: boolean }).ok).toBe(true);
    const deployed = await main(["deploy", "--stage", "prep", "--database-id", PRODUCTION_DB_ID], {
      exec,
      cwd: process.cwd(),
      env: {},
      vinextDeploy: async () => ({ id: "skip" }),
      migrationFiles: [...HISTORICAL_MIGRATIONS, FORWARD_MIGRATION],
    });
    expect((deployed as { dryRun: boolean }).dryRun).toBe(true);
    await expect(main(["nope"], { exec, cwd: process.cwd(), env: {} })).rejects.toThrow(
      /baseline, remap, or deploy/,
    );
    await expect(main(["remap"], { exec, cwd: process.cwd(), env: {} })).rejects.toThrow(
      /mapping-file/,
    );
    const fromFile = await main(["remap"], {
      exec: remapExec,
      cwd: process.cwd(),
      env: {},
      mappingFile: "map.json",
      readFile: () => JSON.stringify({ "old-google-1": "a@b.com" }),
    });
    expect((fromFile as { ok: boolean }).ok).toBe(true);
    const fromFlag = await main(["remap", "--mapping-file", "map.json"], {
      exec: remapExec,
      cwd: process.cwd(),
      env: {},
      readFile: () => JSON.stringify({ "old-google-1": "a@b.com" }),
    });
    expect((fromFlag as { ok: boolean }).ok).toBe(true);
    const injected = await main(["remap"], {
      exec: remapExec,
      mapping: { "old-google-1": "a@b.com" },
    });
    expect((injected as { ok: boolean }).ok).toBe(true);
    const mapDir = mkdtempSync(join(tmpdir(), "gecko-map-"));
    const mapFile = join(mapDir, "map.json");
    writeFileSync(mapFile, JSON.stringify({ "old-google-1": "a@b.com" }));
    const fromDiskMap = await main(["remap", "--mapping-file", mapFile], {
      exec: remapExec,
      cwd: process.cwd(),
      env: {},
    });
    expect((fromDiskMap as { ok: boolean }).ok).toBe(true);
    const analyzingExec: CfExec = async (args, options) => {
      if (sqlArg(args).includes("__analyzing__")) {
        return { stdout: queryStdout([{ n: "1" }]), stderr: "", code: 0 };
      }
      return inspectExec()(args, options ?? { cwd: process.cwd(), env: {}, timeoutMs: 1 });
    };
    await expect(
      main(["deploy", "--stage", "prep", "--database-id", PRODUCTION_DB_ID], {
        exec: analyzingExec,
        cwd: process.cwd(),
        env: {},
        vinextDeploy: async () => ({ id: "skip" }),
        migrationFiles: [...HISTORICAL_MIGRATIONS, FORWARD_MIGRATION],
      }),
    ).rejects.toThrow(/baseline blocked/);
    const fromDisk = await main(["deploy", "--stage", "prep", "--database-id", PRODUCTION_DB_ID], {
      exec,
      cwd: process.cwd(),
      env: {},
      vinextDeploy: async () => ({ id: "skip" }),
    });
    expect((fromDisk as { dryRun: boolean }).dryRun).toBe(true);
  });

  test("writeLedger and remote migration apply call cf", async () => {
    const calls: string[] = [];
    const exec = execFrom([
      (args) => {
        calls.push(args.join(" "));
        if (
          args[1] === "query" &&
          sqlArg(args).includes("CREATE TABLE IF NOT EXISTS d1_migrations")
        ) {
          return { stdout: queryStdout([]) };
        }
        if (args[1] === "migrations")
          return { stdout: '[{ "name": "0009_add_analysis_claim.sql", "status": "✅" }]' };
        if (args[0] === "workers" && args[1] === "get") {
          return { stdout: JSON.stringify({ name: "gecko", triggers: [{ cron: "0 * * * *" }] }) };
        }
        return { stdout: queryStdout([]), code: 1, stderr: "fail" };
      },
    ]);
    const store = createBaselineStore(exec, { cwd: process.cwd(), env: {} });
    await store.writeLedger({
      databaseId: PRODUCTION_DB_ID,
      accountId: "acct",
      historical: ["0001_cloud_init.sql"],
      forwardApplied: [],
      rowCounts: {},
      bookmark: "b",
    });
    const adapter = createDeployAdapter(exec, async () => ({ id: "x" }), {
      cwd: process.cwd(),
      env: {},
    });
    await adapter.applyMigrations(PRODUCTION_DB_ID, [FORWARD_MIGRATION]);
    expect(await adapter.remoteTriggers()).toEqual([{ cron: "0 * * * *" }]);
    expect(calls.some((item) => item.includes("d1_migrations"))).toBe(true);
  });

  test("default vinext deploy parses ids, failures, and timeouts", async () => {
    const commands: string[] = [];
    const fake = (code: number, output: string, hang = false) =>
      ((command: string) => {
        commands.push(command);
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          kill: () => void;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {
          child.emit("exit", 1);
        };
        queueMicrotask(() => {
          child.stdout.emit("data", output);
          if (!hang) child.emit("exit", code);
        });
        return child;
      }) as unknown as typeof import("node:child_process").spawn;
    await expect(
      defaultVinextDeploy(
        {},
        process.cwd(),
        fake(0, "11111111-1111-1111-1111-111111111111") as never,
      ),
    ).resolves.toEqual({ id: "11111111-1111-1111-1111-111111111111" });
    await expect(defaultVinextDeploy({}, process.cwd(), fake(1, "boom") as never)).rejects.toThrow(
      /boom/,
    );
    await expect(
      defaultVinextDeploy({}, process.cwd(), fake(0, "hang", true) as never, 20),
    ).rejects.toThrow(/timed out/);
    expect(commands.every((command) => command === "node")).toBe(true);
  });

  test("vinext deploy records stderr, spawn errors, and ignores late errors", async () => {
    const fake = (mode: "stderr" | "error" | "late-error") =>
      (() => {
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          kill: () => void;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {
          if (mode === "late-error") {
            child.emit("error", new Error("late"));
            return;
          }
          child.emit("exit", 1);
        };
        queueMicrotask(() => {
          if (mode === "stderr") {
            child.stderr.emit("data", "boom-err");
            child.emit("exit", 1);
          } else if (mode === "error") {
            child.emit("error", new Error("spawn fail"));
          }
        });
        return child;
      }) as unknown as typeof import("node:child_process").spawn;
    await expect(defaultVinextDeploy({}, process.cwd(), fake("stderr") as never)).rejects.toThrow(
      /boom-err/,
    );
    await expect(defaultVinextDeploy({}, process.cwd(), fake("error") as never)).rejects.toThrow(
      /spawn fail/,
    );
    await expect(
      defaultVinextDeploy({}, process.cwd(), fake("late-error") as never, 20),
    ).rejects.toThrow(/timed out/);
  });

  test("inspect and apply use empty-field and empty-output fallbacks", async () => {
    const sparse: CfExec = async (args, options) => {
      const sql = sqlArg(args);
      if (sql.includes("type='table'")) {
        return {
          stdout: queryStdout([
            { sql: "CREATE TABLE ghost (id TEXT)" },
            ...Object.entries(tableSql).map(([name, sqlText]) => ({ name, sql: sqlText })),
          ]),
          stderr: "",
          code: 0,
        };
      }
      if (sql.includes("type='index'")) {
        return { stdout: queryStdout([{ name: "idx_loose" }]), stderr: "", code: 0 };
      }
      if (sql.startsWith("SELECT COUNT(*)") || sql.includes("__analyzing__")) {
        return { stdout: queryStdout([]), stderr: "", code: 0 };
      }
      if (args[1] === "time-travel") {
        return { stdout: JSON.stringify({ ok: true }), stderr: "", code: 0 };
      }
      if (sql.includes("FROM d1_migrations")) throw "no such table: d1_migrations: SQLITE_ERROR";
      return inspectExec()(args, options ?? { cwd: process.cwd(), env: {}, timeoutMs: 1 });
    };
    const snapshot = await createBaselineStore(sparse, { cwd: process.cwd(), env: {} }).inspect();
    expect(snapshot.bookmark).toBeNull();
    expect(snapshot.analyzingWithResult).toBe(0);
    expect(snapshot.tables.some((table) => table.name === "ghost")).toBe(false);
    await expect(
      createBaselineStore(async () => ({ stdout: "oops", stderr: "", code: 1 }), {
        cwd: process.cwd(),
        env: {},
      }).writeLedger({
        databaseId: PRODUCTION_DB_ID,
        accountId: "acct",
        historical: ["0001_cloud_init.sql"],
        forwardApplied: [],
        rowCounts: {},
        bookmark: "b",
      }),
    ).rejects.toThrow(/oops/);
    await expect(
      createBaselineStore(async () => ({ stdout: "", stderr: "", code: 1 }), {
        cwd: process.cwd(),
        env: {},
      }).writeLedger({
        databaseId: PRODUCTION_DB_ID,
        accountId: "acct",
        historical: ["0001_cloud_init.sql"],
        forwardApplied: [],
        rowCounts: {},
        bookmark: "b",
      }),
    ).rejects.toThrow(/ledger write failed/);
    await expect(
      createRemapStore(async () => ({ stdout: "remap-out", stderr: "", code: 1 }), {
        cwd: process.cwd(),
        env: {},
      }).applyStatements(["UPDATE settings SET user_id='a'"]),
    ).rejects.toThrow(/remap-out/);
    await expect(
      createRemapStore(async () => ({ stdout: "", stderr: "", code: 1 }), {
        cwd: process.cwd(),
        env: {},
      }).applyStatements(["UPDATE settings SET user_id='a'"]),
    ).rejects.toThrow(/remap apply failed/);
    await expect(
      createDeployAdapter(
        async () => ({ stdout: "mig-out", stderr: "", code: 1 }),
        async () => ({ id: "x" }),
        { cwd: process.cwd(), env: {} },
      ).applyMigrations(PRODUCTION_DB_ID, [FORWARD_MIGRATION]),
    ).rejects.toThrow(/mig-out/);
    await expect(
      createDeployAdapter(
        async () => ({ stdout: "", stderr: "", code: 1 }),
        async () => ({ id: "x" }),
        { cwd: process.cwd(), env: {} },
      ).applyMigrations(PRODUCTION_DB_ID, [FORWARD_MIGRATION]),
    ).rejects.toThrow(/migrations apply failed/);
    await expect(
      createDeployAdapter(
        async () => ({ stdout: "worker-out", stderr: "", code: 1 }),
        async () => ({ id: "x" }),
        { cwd: process.cwd(), env: {} },
      ).remoteTriggers(),
    ).rejects.toThrow(/worker-out/);
    await expect(
      createDeployAdapter(
        async () => ({ stdout: "", stderr: "", code: 1 }),
        async () => ({ id: "x" }),
        { cwd: process.cwd(), env: {} },
      ).remoteTriggers(),
    ).rejects.toThrow(/workers get failed/);
    const emptyChild = (() => {
      const child = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: () => void;
      };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {
        child.emit("exit", 1);
      };
      queueMicrotask(() => child.emit("exit", 1));
      return child;
    }) as unknown as typeof import("node:child_process").spawn;
    await expect(defaultVinextDeploy({}, process.cwd(), emptyChild as never)).rejects.toThrow(
      /exited 1/,
    );
  });
});
