// D1 REST API client for Cloudflare D1 database access.
// Since the web dashboard runs on Bun (not Workers), we access D1
// via the Cloudflare REST API.

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

/** Read D1 config from environment variables.
 *  When CF_D1_DATABASE_ID_TEST is set (E2E mode), it takes priority
 *  over the production CF_D1_DATABASE_ID to ensure test isolation. */
export function getD1Config(): D1Config {
  const testDbId = process.env.CF_D1_DATABASE_ID_TEST;
  return {
    accountId: process.env.CF_ACCOUNT_ID ?? "",
    apiToken: process.env.CF_API_TOKEN ?? "",
    databaseId: testDbId || process.env.CF_D1_DATABASE_ID || "",
  };
}

/** Build the D1 REST API URL. */
function buildUrl(config: D1Config): string {
  return `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;
}

/** Execute a raw SQL query and return the full result with meta. */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<D1ExecuteResult> {
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
        const errorMsg =
          data.errors?.[0]?.message ?? "Unknown D1 error";
        throw new Error(`D1 query failed: ${errorMsg}`);
      }

      return {
        results: data.result[0].results,
        meta: data.result[0].meta,
      };
    } catch (err) {
      lastError = err;
      // Only retry on network-level errors (socket reset, TLS closure)
      const isNetworkError =
        err instanceof TypeError && err.message === "fetch failed";
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

/** Execute a SELECT query and return typed results. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await execute(sql, params);
  return result.results as T[];
}

/** Verify the connected D1 database has a _test_marker table with env=test.
 *  Call this in E2E setup to prevent accidental writes to production. */
export async function verifyTestDatabase(): Promise<void> {
  const config = getD1Config();
  try {
    const rows = await query<{ key: string; value: string }>(
      "SELECT key, value FROM _test_marker WHERE key = ?",
      ["env"]
    );
    if (rows.length === 0) {
      throw new Error(
        `D1 test marker check failed: database ${config.databaseId} is NOT a test instance. ` +
          `Expected _test_marker.env = 'test'. Refusing to run E2E tests against production data.`
      );
    }
    const marker = rows[0];
    if (!marker || marker.value !== "test") {
      throw new Error(
        `D1 test marker check failed: database ${config.databaseId} is NOT a test instance. ` +
          `Expected _test_marker.env = 'test'. Refusing to run E2E tests against production data.`
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("test marker check failed")) {
      throw err;
    }
    throw new Error(
      `D1 test marker table missing in database ${config.databaseId}. ` +
        `This database is not configured for E2E testing. ` +
        `Create the marker: INSERT INTO _test_marker (key, value) VALUES ('env', 'test')`
    );
  }
}

