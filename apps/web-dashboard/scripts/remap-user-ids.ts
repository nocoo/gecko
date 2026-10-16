import {
  flagString,
  maybeRunCli,
  parseFlags,
  redactId,
  requireApproval,
  requireProductionDatabaseId,
} from "./cutover-guard";
import { isUserIdTable, TABLE_UNIQUES, USER_ID_TABLES, type UserIdTable } from "./cutover-schema";
import { PRODUCTION_DB_ID } from "./worker-stage";

export type StoredRow = Record<string, string>;

export type UniqueConflict = {
  table: UserIdTable;
  columns: string[];
  key: string;
  values: Record<string, string>;
};

export type RemapConflictResolution = {
  table: UserIdTable;
  key: string;
  keep: "source" | "target";
};

export type RemapMapping = Map<string, string>;

export type RemapStore = {
  tablesWithUserId(): Promise<string[]>;
  loadTable(table: UserIdTable): Promise<StoredRow[]>;
  applyStatements(sql: string[]): Promise<void>;
};

export type RemapReport = {
  ok: boolean;
  blocked: string[];
  moves: { from: string; to: string; tables: Record<string, number> }[];
  conflicts: UniqueConflict[];
  manyToOne: string[];
  statements: string[];
  remainingOldIds: string[];
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseMapping(raw: unknown): RemapMapping {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("mapping must be an object of oldId -> email");
  }
  const map: RemapMapping = new Map();
  for (const [oldId, email] of Object.entries(raw as Record<string, unknown>)) {
    if (!oldId) throw new Error("mapping contains an empty id");
    if (typeof email !== "string" || !EMAIL.test(email)) {
      throw new Error("mapping values must be emails");
    }
    map.set(oldId, email.toLowerCase());
  }
  if (map.size === 0) throw new Error("mapping is empty");
  return map;
}

export function manyToOneTargets(map: RemapMapping): Map<string, string[]> {
  const targets = new Map<string, string[]>();
  for (const [oldId, email] of map) {
    const current = targets.get(email) ?? [];
    current.push(oldId);
    targets.set(email, current);
  }
  return new Map([...targets].filter(([, olds]) => olds.length > 1));
}

function rowKey(row: StoredRow, columns: string[]): string {
  return columns.map((column) => row[column] ?? "").join("\0");
}

export function conflictsForMove(
  table: UserIdTable,
  rows: StoredRow[],
  oldId: string,
  newId: string,
): UniqueConflict[] {
  const source = rows.filter((row) => row.user_id === oldId);
  const target = rows.filter((row) => row.user_id === newId);
  const found: UniqueConflict[] = [];
  for (const spec of TABLE_UNIQUES[table]) {
    if (!spec.columns.includes("user_id")) {
      for (const left of source) {
        for (const right of target) {
          if (spec.columns.every((column) => left[column] === right[column])) {
            found.push({
              table,
              columns: spec.columns,
              key: spec.columns.map((column) => left[column] ?? "").join("+"),
              values: Object.fromEntries(
                spec.columns.map((column) => [column, left[column] ?? ""]),
              ),
            });
          }
        }
      }
      continue;
    }
    const rest = spec.columns.filter((column) => column !== "user_id");
    const targetKeys = new Set(target.map((row) => rowKey(row, rest)));
    for (const left of source) {
      const key = rowKey(left, rest);
      if (targetKeys.has(key)) {
        found.push({
          table,
          columns: spec.columns,
          key: rest.map((column) => left[column] ?? "").join("+"),
          values: Object.fromEntries(rest.map((column) => [column, left[column] ?? ""])),
        });
      }
    }
  }
  return found;
}

function allowedConflict(
  conflict: UniqueConflict,
  resolutions: RemapConflictResolution[],
): RemapConflictResolution | undefined {
  return resolutions.find((item) => item.table === conflict.table && item.key === conflict.key);
}

export function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

export function remapStatements(
  table: UserIdTable,
  oldId: string,
  newId: string,
  resolutions: RemapConflictResolution[],
  conflicts: UniqueConflict[],
): string[] {
  const sql: string[] = [];
  for (const conflict of conflicts) {
    const resolution = allowedConflict(conflict, resolutions);
    if (!resolution) continue;
    const discard = resolution.keep === "source" ? newId : oldId;
    const rest = conflict.columns.filter((column) => column !== "user_id");
    const predicates = [`user_id = '${sqlEscape(discard)}'`];
    for (const column of rest) {
      predicates.push(`${column} = '${sqlEscape(conflict.values[column] ?? "")}'`);
    }
    sql.push(`DELETE FROM ${table} WHERE ${predicates.join(" AND ")}`);
  }
  sql.push(
    `UPDATE ${table} SET user_id = '${sqlEscape(newId)}' WHERE user_id = '${sqlEscape(oldId)}'`,
  );
  return sql;
}

export async function planRemap(
  map: RemapMapping,
  store: RemapStore,
  options: {
    allowMerges?: boolean;
    resolutions?: RemapConflictResolution[];
    completedOldIds?: string[];
    statementBudget?: number;
  } = {},
): Promise<RemapReport> {
  const tables = await store.tablesWithUserId();
  const extra = tables.filter((name) => !isUserIdTable(name)).sort();
  const missing = USER_ID_TABLES.filter((name) => !tables.includes(name));
  const blocked: string[] = [];
  if (extra.length > 0) blocked.push(`extra user_id tables: ${extra.join(",")}`);
  if (missing.length > 0) blocked.push(`missing user_id tables: ${missing.join(",")}`);
  const merges = manyToOneTargets(map);
  const manyToOne = [...merges.keys()];
  if (merges.size > 0 && !options.allowMerges) {
    blocked.push("many-to-one mapping requires explicit --allow-merges");
  }
  const completed = new Set(options.completedOldIds ?? []);
  const queuedOldIds = [...map.keys()].filter((oldId) => !completed.has(oldId));
  const rowsByTable = new Map<UserIdTable, StoredRow[]>();
  for (const table of USER_ID_TABLES) {
    rowsByTable.set(table, tables.includes(table) ? await store.loadTable(table) : []);
  }
  const moves: RemapReport["moves"] = [];
  const conflicts: UniqueConflict[] = [];
  const statements: string[] = [];
  const budget = options.statementBudget ?? 100;
  const unresolved: UniqueConflict[] = [];
  const processed: string[] = [];
  for (const oldId of queuedOldIds) {
    const newId = map.get(oldId);
    if (!newId) continue;
    const tablesTouched: Record<string, number> = {};
    const nextSql: string[] = [];
    for (const table of USER_ID_TABLES) {
      const rows = rowsByTable.get(table) ?? [];
      const count = rows.filter((row) => row.user_id === oldId).length;
      tablesTouched[table] = count;
      const found = conflictsForMove(table, rows, oldId, newId);
      for (const conflict of found) {
        conflicts.push(conflict);
        if (!allowedConflict(conflict, options.resolutions ?? [])) unresolved.push(conflict);
      }
      if (count > 0) {
        nextSql.push(...remapStatements(table, oldId, newId, options.resolutions ?? [], found));
      }
    }
    if (statements.length + nextSql.length > budget) {
      if (statements.length === 0) blocked.push("single id exceeds statement budget");
      break;
    }
    statements.push(...nextSql);
    processed.push(oldId);
    moves.push({ from: redactId(oldId), to: redactId(newId), tables: tablesTouched });
  }
  if (unresolved.length > 0) {
    blocked.push(`unique key conflicts: ${unresolved.length}`);
  }
  return {
    ok: blocked.length === 0,
    blocked,
    moves,
    conflicts,
    manyToOne: manyToOne.map(redactId),
    statements,
    remainingOldIds: queuedOldIds.filter((oldId) => !processed.includes(oldId)),
  };
}

export async function runRemap(
  argv: string[],
  deps: {
    store: RemapStore;
    mapping: unknown;
    env?: NodeJS.ProcessEnv;
    resolutions?: RemapConflictResolution[];
    completedOldIds?: string[];
  },
): Promise<RemapReport> {
  const flags = parseFlags(argv);
  const map = parseMapping(deps.mapping);
  const budgetRaw = flagString(flags, "statement-budget");
  const report = await planRemap(map, deps.store, {
    allowMerges: Boolean(flags["allow-merges"]),
    resolutions: deps.resolutions,
    completedOldIds: deps.completedOldIds,
    statementBudget: budgetRaw ? Number(budgetRaw) : 100,
  });
  if (!flags.apply) return report;
  if (flagString(flags, "database-id") === PRODUCTION_DB_ID) {
    requireProductionDatabaseId(flagString(flags, "database-id"));
    requireApproval(flagString(flags, "approve"), "gecko-remap");
    if (!flags["silence-confirmed"]) throw new Error("remap apply requires --silence-confirmed");
    if (!flagString(flags, "recovery-checkpoint")) {
      throw new Error("remap apply requires --recovery-checkpoint");
    }
  } else {
    requireApproval(flagString(flags, "approve"), "gecko-remap-local");
  }
  if (!report.ok) throw new Error(`remap blocked: ${report.blocked.join("; ")}`);
  await deps.store.applyStatements(report.statements);
  if (report.statements.length === 0) return report;
  return report;
}

export async function main(
  argv = process.argv.slice(2),
  deps?: { store: RemapStore; mapping: unknown; env?: NodeJS.ProcessEnv },
): Promise<RemapReport> {
  if (!deps) {
    throw new Error("remap-user-ids requires an injected store; refusing implicit remote remap");
  }
  return runRemap(argv, deps);
}

maybeRunCli(process.argv[1], "remap-user-ids.ts", () => main());
