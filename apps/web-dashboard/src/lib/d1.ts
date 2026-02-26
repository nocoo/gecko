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

/** Read D1 config from environment variables. */
export function getD1Config(): D1Config {
  return {
    accountId: process.env.CF_ACCOUNT_ID ?? "",
    apiToken: process.env.CF_API_TOKEN ?? "",
    databaseId: process.env.CF_D1_DATABASE_ID ?? "",
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

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!response.ok) {
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
}

/** Execute a SELECT query and return typed results. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await execute(sql, params);
  return result.results as T[];
}
