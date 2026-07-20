// D1 database client — supports both Cloudflare D1 REST API (production)
// and local SQLite via better-sqlite3 (development / E2E testing).
//
// Mode selection:
//   - D1_LOCAL_PATH env var set → local SQLite file (better-sqlite3)
//   - Otherwise → Cloudflare D1 REST API (requires CF_ACCOUNT_ID, CF_API_TOKEN, CF_D1_DATABASE_ID)
//
// Note: better-sqlite3 is loaded via dynamic import() so vitest/Node unit
// tests (which never set D1_LOCAL_PATH) don't pay the import cost.

export interface D1Config {
  accountId: string;
  apiToken: string;
  databaseId: string;
}

export interface D1Meta {
  changes: number;
  last_row_id: number;
  [key: string]: unknown;
}

export interface D1ExecuteResult {
  results: unknown[];
  meta: D1Meta;
}

interface D1Response {
  success: boolean;
  result: Array<{
    results: unknown[];
    success: boolean;
    meta: D1Meta;
  }>;
  errors: Array<{ message: string }>;
}

// ---------------------------------------------------------------------------
// Local SQLite mode (better-sqlite3) — lazy loaded
// Covered by E2E tests; excluded from v8 coverage (unit tests don't set D1_LOCAL_PATH).
// ---------------------------------------------------------------------------

type BetterSqliteDatabase = import("better-sqlite3").Database;
let localDb: BetterSqliteDatabase | null = null;

/* v8 ignore start */
/** Get or create the local SQLite database connection. */
async function getLocalDb() {
  if (!localDb) {
    const Database = (await import("better-sqlite3")).default;
    const dbPath = process.env.D1_LOCAL_PATH ?? "";
    localDb = new Database(dbPath);
    localDb.pragma("journal_mode = WAL");
    localDb.pragma("foreign_keys = ON");
  }
  return localDb;
}
/* v8 ignore stop */

/** Check if we should use local SQLite mode. */
export function isLocalMode(): boolean {
  return !!process.env.D1_LOCAL_PATH;
}

/* v8 ignore start */
/** Execute a query against local SQLite and return D1-compatible result. */
async function executeLocal(sql: string, params: unknown[] = []): Promise<D1ExecuteResult> {
  const db = await getLocalDb();
  const trimmed = sql.trim().toUpperCase();
  const isSelect =
    trimmed.startsWith("SELECT") || trimmed.startsWith("WITH") || trimmed.startsWith("PRAGMA");

  if (isSelect) {
    const stmt = db.prepare(sql);
    const results = stmt.all(...params);
    return {
      results,
      meta: { changes: 0, last_row_id: 0 },
    };
  }

  const stmt = db.prepare(sql);
  const info = stmt.run(...params);
  return {
    results: [],
    meta: {
      changes: info.changes,
      last_row_id: Number(info.lastInsertRowid),
    },
  };
}
/* v8 ignore stop */

// ---------------------------------------------------------------------------
// Remote D1 REST API mode
// ---------------------------------------------------------------------------

/** Read D1 config from environment variables. */
export function getD1Config(): D1Config {
  return {
    accountId: process.env.CF_ACCOUNT_ID ?? "",
    apiToken: process.env.CF_API_TOKEN ?? "",
    databaseId: process.env.CF_D1_DATABASE_ID || "",
  };
}

/** Build the D1 REST API URL. */
function buildUrl(config: D1Config): string {
  return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
}

/** Execute a query against the remote D1 REST API. */
async function executeRemote(sql: string, params: unknown[] = []): Promise<D1ExecuteResult> {
  const config = getD1Config();
  const url = buildUrl(config);

  // Retry on transient network errors (socket resets, TLS closures).
  // D1 REST API occasionally drops idle connections.
  const MAX_RETRIES = 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
      });

      if (!response.ok) {
        // response.text() doesn't reject in practice for fetch Responses;
        // the `.catch` is defense-in-depth only.
        /* v8 ignore next */
        const text = await response.text().catch(() => "Unknown error");
        throw new Error(`D1 API error (${response.status}): ${text}`);
      }

      const data = (await response.json()) as D1Response;

      if (!data.success || !data.result?.[0]?.success) {
        const errorMsg = data.errors?.[0]?.message ?? "Unknown D1 error";
        throw new Error(`D1 query failed: ${errorMsg}`);
      }

      return {
        results: data.result[0].results,
        meta: data.result[0].meta,
      };
    } catch (err) {
      lastError = err;
      // Only retry on network-level errors (socket reset, TLS closure)
      const isNetworkError = err instanceof TypeError && err.message === "fetch failed";
      if (!isNetworkError || attempt === MAX_RETRIES) {
        throw err;
      }
      // Brief backoff before retry
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }

  // Unreachable, but satisfies TypeScript
  throw lastError;
}

// ---------------------------------------------------------------------------
// Public API — routes to local or remote based on D1_LOCAL_PATH
// ---------------------------------------------------------------------------

/** Execute a raw SQL query and return the full result with meta. */
export async function execute(sql: string, params: unknown[] = []): Promise<D1ExecuteResult> {
  /* v8 ignore next 3 */
  if (isLocalMode()) {
    return executeLocal(sql, params);
  }
  return executeRemote(sql, params);
}

/** Execute a SELECT query and return typed results. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await execute(sql, params);
  return result.results as T[];
}

/** Close the local SQLite connection (for clean shutdown in tests). */
export function closeLocal(): void {
  /* v8 ignore next 4 */
  if (localDb) {
    localDb.close();
    localDb = null;
  }
}
