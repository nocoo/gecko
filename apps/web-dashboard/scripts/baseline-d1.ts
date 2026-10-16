import {
  assertNotTestProcess,
  flagString,
  maybeRunCli,
  parseFlags,
  requireApproval,
  requireProductionAccount,
  requireProductionDatabaseId,
} from "./cutover-guard";
import {
  FORWARD_MIGRATION,
  HISTORICAL_MIGRATIONS,
  isUserIdTable,
  USER_ID_TABLES,
} from "./cutover-schema";
import { PRODUCTION_ACCOUNT_ID, PRODUCTION_DB_ID, PRODUCTION_DB_NAME } from "./worker-stage";

export type TableSnapshot = {
  name: string;
  columns: string[];
  sql: string;
  rowCount: number;
};

export type D1Snapshot = {
  accountId: string;
  databaseId: string;
  databaseName: string;
  tables: TableSnapshot[];
  indexes: { name: string; tableName: string; sql: string }[];
  d1Migrations: string[];
  analyzingWithResult: number;
  bookmark: string | null;
};

export type BaselineLedger = {
  databaseId: string;
  accountId: string;
  historical: string[];
  forwardApplied: string[];
  rowCounts: Record<string, number>;
  bookmark: string | null;
};

export type BaselineReport = {
  ok: boolean;
  blocked: string[];
  databaseId: string;
  provenHistorical: string[];
  forwardPresent: boolean;
  extraUserIdTables: string[];
  missingHistorical: string[];
  rowCounts: Record<string, number>;
  bookmark: string | null;
  ledger: BaselineLedger | null;
};

export type BaselineStore = {
  inspect(): Promise<D1Snapshot>;
  writeLedger?(ledger: BaselineLedger): Promise<void>;
};

function table(snapshot: D1Snapshot, name: string): TableSnapshot | undefined {
  return snapshot.tables.find((item) => item.name === name);
}

function hasSlimFocusSessions(focus: TableSnapshot): boolean {
  return (
    focus.sql.includes("DEFAULT (datetime('now'))") && !/end_time\s+REAL\s+NOT NULL/.test(focus.sql)
  );
}

export function provenHistoricalMigrations(snapshot: D1Snapshot): string[] {
  const names = new Set(snapshot.tables.map((item) => item.name));
  const focus = table(snapshot, "focus_sessions");
  const summaries = table(snapshot, "daily_summaries");
  const proven: string[] = [];
  if (names.has("focus_sessions") && names.has("api_keys") && names.has("sync_logs")) {
    proven.push("0001_cloud_init.sql");
  }
  if (proven.length === 1 && focus && hasSlimFocusSessions(focus)) {
    proven.push("0002_slim_columns.sql");
  }
  if (
    proven.length === 2 &&
    names.has("categories") &&
    names.has("app_category_mappings") &&
    names.has("tags") &&
    names.has("app_tag_mappings")
  ) {
    proven.push("0003_categories_tags.sql");
  }
  if (proven.length === 3 && names.has("settings")) proven.push("0004_settings.sql");
  if (proven.length === 4 && names.has("daily_summaries")) proven.push("0005_daily_summaries.sql");
  if (proven.length === 5 && names.has("app_notes")) proven.push("0006_app_notes.sql");
  if (proven.length === 6 && summaries && !summaries.columns.includes("stats_json")) {
    proven.push("0007_drop_stats_json.sql");
  }
  if (proven.length === 7 && summaries?.columns.includes("ai_prompt")) {
    proven.push("0008_add_ai_prompt.sql");
  }
  return proven;
}

export function extraUserIdTables(snapshot: D1Snapshot): string[] {
  return snapshot.tables
    .filter((item) => item.columns.includes("user_id") && !isUserIdTable(item.name))
    .map((item) => item.name)
    .sort();
}

export function inspectBaseline(snapshot: D1Snapshot): BaselineReport {
  const provenHistorical = provenHistoricalMigrations(snapshot);
  const summaries = table(snapshot, "daily_summaries");
  const forwardPresent = Boolean(summaries?.columns.includes("claim_token"));
  const extra = extraUserIdTables(snapshot);
  const missingHistorical = HISTORICAL_MIGRATIONS.filter(
    (name) => !provenHistorical.includes(name),
  );
  const blocked: string[] = [];
  if (extra.length > 0) blocked.push(`extra user_id tables: ${extra.join(",")}`);
  if (missingHistorical.length > 0) {
    blocked.push(`historical schema incomplete: ${missingHistorical.join(",")}`);
  }
  if (snapshot.analyzingWithResult > 0) {
    blocked.push("sentinel __analyzing__ rows still have results");
  }
  const rowCounts: Record<string, number> = {};
  for (const item of snapshot.tables) rowCounts[item.name] = item.rowCount;
  const ok = blocked.length === 0;
  const ledger: BaselineLedger | null = ok
    ? {
        databaseId: snapshot.databaseId,
        accountId: snapshot.accountId,
        historical: provenHistorical,
        forwardApplied: forwardPresent ? [FORWARD_MIGRATION] : [],
        rowCounts,
        bookmark: snapshot.bookmark,
      }
    : null;
  return {
    ok,
    blocked,
    databaseId: snapshot.databaseId,
    provenHistorical,
    forwardPresent,
    extraUserIdTables: extra,
    missingHistorical,
    rowCounts,
    bookmark: snapshot.bookmark,
    ledger,
  };
}

export async function runBaseline(
  argv: string[],
  deps: { store: BaselineStore; env?: NodeJS.ProcessEnv },
): Promise<BaselineReport> {
  const flags = parseFlags(argv);
  const env = deps.env ?? {};
  assertNotTestProcess(env);
  const snapshot = await deps.store.inspect();
  const report = inspectBaseline(snapshot);
  if (!flags.apply) return report;
  if (!report.ok || !report.ledger) {
    throw new Error(`baseline blocked: ${report.blocked.join("; ")}`);
  }
  if (snapshot.databaseId === PRODUCTION_DB_ID) {
    requireApproval(flagString(flags, "approve"), "gecko-baseline");
    requireProductionDatabaseId(flagString(flags, "database-id"));
    requireProductionAccount(snapshot.accountId);
    if (snapshot.databaseName !== PRODUCTION_DB_NAME) {
      throw new Error("production database name must be gecko");
    }
    if (report.ledger.historical.length !== HISTORICAL_MIGRATIONS.length) {
      throw new Error("production baseline requires proven 0001-0008");
    }
  } else {
    requireApproval(flagString(flags, "approve"), "gecko-baseline-local");
  }
  if (!deps.store.writeLedger) throw new Error("ledger writer is required for --apply");
  await deps.store.writeLedger(report.ledger);
  return report;
}

export function emptySnapshot(databaseId = "local-empty"): D1Snapshot {
  return {
    accountId: "test-account",
    databaseId,
    databaseName: "empty",
    tables: [],
    indexes: [],
    d1Migrations: [],
    analyzingWithResult: 0,
    bookmark: null,
  };
}

export function historicalSnapshot(overrides: Partial<D1Snapshot> = {}): D1Snapshot {
  const tables: TableSnapshot[] = USER_ID_TABLES.map((name) => {
    const columns = ["user_id"];
    let sql = `CREATE TABLE ${name} (user_id TEXT NOT NULL`;
    if (name === "focus_sessions") {
      columns.push("id", "end_time", "synced_at");
      sql =
        "CREATE TABLE focus_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, end_time REAL, synced_at TEXT DEFAULT (datetime('now')))";
    }
    if (name === "daily_summaries") {
      columns.push("id", "date", "ai_score", "ai_result_json", "ai_model", "ai_prompt");
      sql =
        "CREATE TABLE daily_summaries (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, date TEXT, ai_prompt TEXT)";
    }
    return { name, columns, sql, rowCount: 0 };
  });
  return {
    accountId: PRODUCTION_ACCOUNT_ID,
    databaseId: PRODUCTION_DB_ID,
    databaseName: PRODUCTION_DB_NAME,
    tables,
    indexes: [],
    d1Migrations: [],
    analyzingWithResult: 0,
    bookmark: "bookmark-1",
    ...overrides,
  };
}

export async function main(
  argv = process.argv.slice(2),
  env = process.env,
  store?: BaselineStore,
): Promise<BaselineReport> {
  if (!store) {
    throw new Error("baseline-d1 requires an injected store; refusing implicit remote inspect");
  }
  return runBaseline(argv, { store, env });
}

maybeRunCli(process.argv[1], "baseline-d1.ts", () => main());
