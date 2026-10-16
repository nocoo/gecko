import { getD1, getEnv, patchTestEnv } from "@/lib/runtime-env";

export interface D1Meta {
  changes: number;
  last_row_id: number;
  [key: string]: unknown;
}

export interface D1ExecuteResult {
  results: unknown[];
  meta: D1Meta;
}

function isSelect(sql: string): boolean {
  const trimmed = sql.trim().toUpperCase();
  return trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("PRAGMA");
}

function toResult(result: D1Result<unknown>): D1ExecuteResult {
  return {
    results: (result.results ?? []) as unknown[],
    meta: {
      ...result.meta,
      changes: result.meta?.changes ?? 0,
      last_row_id: result.meta?.last_row_id ?? 0,
    },
  };
}

export async function execute(sql: string, params: unknown[] = []): Promise<D1ExecuteResult> {
  const stmt = getD1()
    .prepare(sql)
    .bind(...params);
  const raw = isSelect(sql) ? await stmt.all() : await stmt.run();
  return toResult(raw);
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await execute(sql, params);
  return result.results as T[];
}

export async function batchExecute(
  items: Array<{ sql: string; params: unknown[] }>,
): Promise<D1ExecuteResult[]> {
  const db = getD1();
  const statements = items.map((item) => db.prepare(item.sql).bind(...item.params));
  const raw = await db.batch(statements);
  return raw.map((row) => toResult(row));
}

export function setD1(db: D1Database | undefined): void {
  patchTestEnv({ ...getEnv(), DB: db });
}
