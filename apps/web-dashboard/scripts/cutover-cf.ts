import { type ChildProcess, spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type BaselineStore, type D1Snapshot, inspectBaseline, runBaseline } from "./baseline-d1";
import { maybeRunCli, parseFlags } from "./cutover-guard";
import { TABLE_UNIQUES, type UserIdTable } from "./cutover-schema";
import { type DeployAdapter, runDeploy } from "./deploy";
import { type RemapStore, runRemap, type StoredRow } from "./remap-user-ids";
import { runCf } from "./seed-test-db";
import {
  inspectGeneratedWorkerConfig,
  PRODUCTION_ACCOUNT_ID,
  PRODUCTION_DB_ID,
  PRODUCTION_DB_NAME,
  PRODUCTION_WORKER,
} from "./worker-stage";

export type CfExec = typeof runCf;

export type VinextDeploy = (env: NodeJS.ProcessEnv, cwd: string) => Promise<{ id: string }>;

export type CutoverCfDeps = {
  exec?: CfExec;
  vinextDeploy?: VinextDeploy;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  mapping?: unknown;
  mappingFile?: string;
  readFile?: (path: string) => string;
  migrationFiles?: string[];
};

const SKIP_TABLES = /^(sqlite_|_cf_|d1_)/;

export function parseJsonValue(text: string): unknown {
  const start = text.search(/[[{]/);
  if (start < 0) throw new Error("cf output did not contain JSON");
  const sliced = text.slice(start);
  const candidates = [sliced.lastIndexOf("]"), sliced.lastIndexOf("}")].filter((end) => end > 0);
  for (const end of candidates.sort((a, b) => b - a)) {
    try {
      return JSON.parse(sliced.slice(0, end + 1));
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  throw new Error("cf output JSON was invalid");
}

export function d1QueryRows(stdout: string, statement = 0): Record<string, string>[] {
  const parsed = parseJsonValue(stdout);
  const batch = Array.isArray(parsed) ? parsed : [parsed];
  const item = batch[statement];
  if (!item || typeof item !== "object") return [];
  const results = (item as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  return results.map((row) => {
    const record = row as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(record))
      out[key] = value == null ? "" : String(value);
    return out;
  });
}

export function extractCronTriggers(value: unknown): { cron: string }[] {
  const found: { cron: string }[] = [];
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (typeof record.cron === "string" && record.cron) found.push({ cron: record.cron });
    for (const nested of Object.values(record)) walk(nested);
  };
  walk(value);
  return found;
}

export function selectColumns(table: UserIdTable): string[] {
  const columns = new Set<string>(["user_id"]);
  for (const spec of TABLE_UNIQUES[table]) {
    for (const column of spec.columns) columns.add(column);
  }
  return [...columns];
}

export function ledgerInsertSql(names: string[]): string {
  const inserts = names
    .map(
      (name) =>
        `INSERT OR IGNORE INTO d1_migrations (name) VALUES ('${name.replace(/'/g, "''")}');`,
    )
    .join("\n");
  return `CREATE TABLE IF NOT EXISTS d1_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
${inserts}`;
}

export function productionEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  delete next.GECKO_TEST_STATE;
  delete next.TEST_AUTH_MODE;
  delete next.CF_API_TOKEN;
  delete next.CF_ACCOUNT_ID;
  delete next.CF_D1_DATABASE_ID;
  if (next.GECKO_RESOURCE_ENV === "test") delete next.GECKO_RESOURCE_ENV;
  if (next.RESOURCE_ENV === "test") delete next.RESOURCE_ENV;
  return next;
}

async function cf(
  exec: CfExec,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<{ stdout: string; stderr: string; code: number }> {
  return exec(args, {
    cwd: options.cwd,
    env: productionEnv(options.env),
    timeoutMs: options.timeoutMs,
  });
}

export async function queryD1(
  exec: CfExec,
  sql: string,
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<Record<string, string>[]> {
  const result = await cf(exec, ["d1", "query", PRODUCTION_DB_ID, "--sql", sql], {
    cwd: options.cwd,
    env: options.env,
    timeoutMs: options.timeoutMs ?? 60_000,
  });
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || "d1 query failed");
  }
  return d1QueryRows(result.stdout);
}

export function createBaselineStore(
  exec: CfExec,
  options: { cwd: string; env: NodeJS.ProcessEnv },
): BaselineStore {
  return {
    async inspect(): Promise<D1Snapshot> {
      const tablesRaw = await queryD1(
        exec,
        "SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;",
        options,
      );
      const indexesRaw = await queryD1(
        exec,
        "SELECT name, tbl_name AS tableName, sql FROM sqlite_master WHERE type='index' ORDER BY name;",
        options,
      );
      const tables = [];
      for (const row of tablesRaw) {
        const name = row.name ?? "";
        if (!name || SKIP_TABLES.test(name)) continue;
        const info = await queryD1(exec, `PRAGMA table_info(${name});`, options);
        const count = await queryD1(exec, `SELECT COUNT(*) AS n FROM ${name};`, options);
        tables.push({
          name,
          columns: info.map((item) => item.name ?? "").filter(Boolean),
          sql: row.sql ?? "",
          rowCount: Number(count[0]?.n ?? 0),
        });
      }
      let d1Migrations: string[] = [];
      try {
        d1Migrations = (
          await queryD1(exec, "SELECT name FROM d1_migrations ORDER BY name;", options)
        )
          .map((row) => row.name ?? "")
          .filter(Boolean);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!/no such table: d1_migrations/i.test(message)) throw error;
      }
      const analyzing = await queryD1(
        exec,
        "SELECT COUNT(*) AS n FROM daily_summaries WHERE ai_model='__analyzing__' AND ai_result_json IS NOT NULL;",
        options,
      );
      const bookmarkResult = await cf(
        exec,
        ["d1", "time-travel", "get-bookmark", PRODUCTION_DB_ID],
        {
          cwd: options.cwd,
          env: options.env,
          timeoutMs: 30_000,
        },
      );
      let bookmark: string | null = null;
      if (bookmarkResult.code === 0) {
        const parsed = parseJsonValue(bookmarkResult.stdout) as { bookmark?: string };
        bookmark = parsed.bookmark ?? null;
      }
      return {
        accountId: PRODUCTION_ACCOUNT_ID,
        databaseId: PRODUCTION_DB_ID,
        databaseName: PRODUCTION_DB_NAME,
        tables,
        indexes: indexesRaw
          .filter((row) => row.name && !SKIP_TABLES.test(row.name))
          .map((row) => ({
            name: row.name ?? "",
            tableName: row.tableName ?? "",
            sql: row.sql ?? "",
          })),
        d1Migrations,
        analyzingWithResult: Number(analyzing[0]?.n ?? 0),
        bookmark,
      };
    },
    async writeLedger(ledger) {
      const result = await cf(
        exec,
        ["d1", "query", PRODUCTION_DB_ID, "--sql", ledgerInsertSql(ledger.historical)],
        { cwd: options.cwd, env: options.env, timeoutMs: 60_000 },
      );
      if (result.code !== 0)
        throw new Error(result.stderr || result.stdout || "ledger write failed");
    },
  };
}

export function createRemapStore(
  exec: CfExec,
  options: { cwd: string; env: NodeJS.ProcessEnv },
): RemapStore {
  return {
    async tablesWithUserId() {
      const tables = await queryD1(
        exec,
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
        options,
      );
      const withUser: string[] = [];
      for (const row of tables) {
        const name = row.name ?? "";
        if (!name || SKIP_TABLES.test(name)) continue;
        const info = await queryD1(exec, `PRAGMA table_info(${name});`, options);
        if (info.some((item) => item.name === "user_id")) withUser.push(name);
      }
      return withUser;
    },
    async loadTable(table) {
      if (table === "focus_sessions") {
        const groups = await queryD1(
          exec,
          "SELECT user_id FROM focus_sessions GROUP BY user_id;",
          options,
        );
        return groups.map((row) => ({ user_id: row.user_id ?? "", id: row.user_id ?? "" }));
      }
      const columns = selectColumns(table);
      const rows = await queryD1(exec, `SELECT ${columns.join(", ")} FROM ${table};`, options);
      return rows as StoredRow[];
    },
    async applyStatements(sql) {
      if (sql.length === 0) return;
      for (const statement of sql) {
        const query = statement.endsWith(";") ? statement : `${statement};`;
        const result = await cf(exec, ["d1", "query", PRODUCTION_DB_ID, "--sql", query], {
          cwd: options.cwd,
          env: options.env,
          timeoutMs: 180_000,
        });
        if (result.code !== 0)
          throw new Error(result.stderr || result.stdout || "remap apply failed");
      }
    },
  };
}

export function createDeployAdapter(
  exec: CfExec,
  vinextDeploy: VinextDeploy,
  options: { cwd: string; env: NodeJS.ProcessEnv },
): DeployAdapter {
  return {
    generateConfig(env) {
      return inspectGeneratedWorkerConfig(env);
    },
    async applyMigrations(_databaseId, pending) {
      if (pending.length === 0) return;
      const result = await cf(
        exec,
        ["d1", "migrations", "apply", PRODUCTION_DB_ID, "--dir", "migrations"],
        {
          cwd: options.cwd,
          env: options.env,
          timeoutMs: 120_000,
        },
      );
      if (result.code !== 0)
        throw new Error(result.stderr || result.stdout || "migrations apply failed");
    },
    async deploy(config) {
      const deployed = await vinextDeploy(
        {
          ...productionEnv(options.env),
          CLOUDFLARE_DEPLOY: "production",
          GECKO_DEPLOY_STAGE: config.domains?.length
            ? config.triggers.length
              ? "cron"
              : "http"
            : "prep",
        },
        options.cwd,
      );
      return deployed;
    },
    async remoteTriggers() {
      const result = await cf(exec, ["workers", "get", PRODUCTION_WORKER], {
        cwd: options.cwd,
        env: options.env,
        timeoutMs: 30_000,
      });
      const text = `${result.stdout}\n${result.stderr}`;
      if (result.code !== 0 && (/\[10007]/.test(text) || /does not exist/i.test(text))) return [];
      if (result.code !== 0)
        throw new Error(result.stderr || result.stdout || "workers get failed");
      return extractCronTriggers(parseJsonValue(result.stdout));
    },
  };
}

function readMapping(deps: CutoverCfDeps, argv: string[]): unknown {
  if (deps.mapping) return deps.mapping;
  const flags = parseFlags(argv);
  const file = typeof flags["mapping-file"] === "string" ? flags["mapping-file"] : deps.mappingFile;
  if (file) {
    const read = deps.readFile ?? ((path: string) => readFileSync(path, "utf8"));
    return JSON.parse(read(file));
  }
  const raw = (deps.env ?? process.env).GECKO_REMAP_JSON;
  if (!raw) throw new Error("remap requires --mapping-file or GECKO_REMAP_JSON");
  return JSON.parse(raw);
}

function migrationFiles(cwd: string, override?: string[]): string[] {
  if (override) return override;
  return readdirSync(resolve(cwd, "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

export function parseDeployedId(text: string): string {
  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return match?.[0] ?? "deployed";
}

export function writeCutoverReport(
  value: unknown,
  write: (text: string) => void = (text) => {
    process.stdout.write(text);
  },
): void {
  write(`${JSON.stringify(value, null, 2)}\n`);
}

export async function defaultVinextDeploy(
  env: NodeJS.ProcessEnv,
  cwd: string,
  spawnFn: typeof spawn = spawn,
  timeoutMs = 15 * 60_000,
): Promise<{ id: string }> {
  return new Promise((resolvePromise, reject) => {
    const child: ChildProcess = spawnFn(
      "node",
      [resolve(cwd, "node_modules/@vinext/cloudflare/dist/cli.js"), "deploy"],
      { cwd, env: productionEnv(env), stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      reject(new Error("vinext-cloudflare deploy timed out"));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      if (timedOut) return;
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      if (timedOut) return;
      clearTimeout(timer);
      if (code !== 0) {
        reject(
          new Error(
            [stderr.trim(), stdout.trim()].filter(Boolean).join("\n") ||
              `vinext-cloudflare deploy exited ${code}`,
          ),
        );
        return;
      }
      resolvePromise({ id: parseDeployedId(`${stdout}\n${stderr}`) });
    });
  });
}

export async function main(
  argv = process.argv.slice(2),
  deps: CutoverCfDeps = {},
): Promise<unknown> {
  const [command, ...rest] = argv;
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const exec = deps.exec ?? runCf;
  if (command === "baseline") {
    return runBaseline(rest, { store: createBaselineStore(exec, { cwd, env }), env });
  }
  if (command === "remap") {
    return runRemap(rest, {
      store: createRemapStore(exec, { cwd, env }),
      mapping: readMapping(deps, rest),
      env,
    });
  }
  if (command === "deploy") {
    const store = createBaselineStore(exec, { cwd, env });
    const snapshot = await store.inspect();
    const report = inspectBaseline(snapshot);
    if (!report.ledger) throw new Error(`baseline blocked: ${report.blocked.join("; ")}`);
    return runDeploy(rest, {
      adapter: createDeployAdapter(exec, deps.vinextDeploy ?? defaultVinextDeploy, { cwd, env }),
      ledger: report.ledger,
      migrationFiles: migrationFiles(cwd, deps.migrationFiles),
      analyzingWithResult: snapshot.analyzingWithResult,
      env,
    });
  }
  throw new Error("cutover-cf command must be baseline, remap, or deploy");
}

maybeRunCli(process.argv[1], "cutover-cf.ts", async () => {
  const result = await main();
  writeCutoverReport(result);
  return result;
});
