import { patchTestEnv, setTestEnv } from "@/lib/runtime-env";

export const TEST_USER_ID = "e2e-test-user";
export const TEST_EMAIL = "e2e@test.local";
export const TEST_DEVICE_ID = "e2e-test-device";
export const TEST_AUD = "bc4c0722bcd5e327e650d26a24358aa80ec6077782a1f484e9ec48d09bdaeb13";

export interface ScriptedCall {
  sql: string;
  params: unknown[];
}

export interface ExternalFetchCall {
  url: string;
  method: string;
  init?: RequestInit;
}

function asResult(
  results: unknown[],
  changes = Array.isArray(results) ? results.length : 0,
): D1Result {
  return {
    results,
    success: true,
    meta: { changes, last_row_id: 0 },
  };
}

function wrapRaw(raw: unknown): D1Result {
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "results" in raw) {
    const wrapped = raw as {
      results: unknown[];
      meta?: { changes?: number; last_row_id?: number };
      changes?: number;
    };
    return {
      results: wrapped.results,
      success: true,
      meta: {
        changes: wrapped.meta?.changes ?? wrapped.changes ?? wrapped.results.length,
        last_row_id: wrapped.meta?.last_row_id ?? 0,
      },
    };
  }
  return asResult((raw as unknown[]) ?? []);
}

class ScriptedStatement {
  constructor(
    private readonly db: ScriptedD1,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): ScriptedStatement {
    return new ScriptedStatement(this.db, this.sql, params);
  }

  all(): Promise<D1Result> {
    return Promise.resolve(this.db.exec(this.sql, this.params));
  }

  run(): Promise<D1Result> {
    return Promise.resolve(this.db.exec(this.sql, this.params));
  }
}

export class ScriptedD1 {
  readonly calls: ScriptedCall[] = [];
  autoApiKey = true;
  autoSync = true;
  handler?: (sql: string, params: unknown[]) => unknown;
  throwOn?: (sql: string, params: unknown[]) => Error | undefined;
  private callIndex = 0;

  constructor(private responses: unknown[] = [[]]) {}

  setResponses(responses: unknown[]): void {
    this.responses = responses;
    this.callIndex = 0;
    this.calls.length = 0;
  }

  prepare(sql: string): ScriptedStatement {
    return new ScriptedStatement(this, sql);
  }

  async batch(statements: ScriptedStatement[]): Promise<D1Result[]> {
    const out: D1Result[] = [];
    for (const statement of statements) {
      out.push(await statement.run());
    }
    return out;
  }

  exec(sql: string, params: unknown[]): D1Result {
    this.calls.push({ sql, params });
    const thrown = this.throwOn?.(sql, params);
    if (thrown) throw thrown;
    const upper = sql.trim().toUpperCase();
    if (
      this.autoApiKey &&
      /FROM\s+API_KEYS/.test(upper) &&
      /WHERE\s+[\s\S]*KEY_HASH\s*=/.test(upper)
    ) {
      return asResult([{ id: "key-1", user_id: TEST_USER_ID, device_id: TEST_DEVICE_ID }]);
    }
    if (this.autoApiKey && /UPDATE\s+API_KEYS/.test(upper) && /LAST_USED/.test(upper)) {
      return asResult([], 1);
    }
    if (this.autoSync && /INSERT INTO\s+FOCUS_SESSIONS/.test(upper)) {
      return asResult([], Math.max(1, Math.floor(params.length / 14)));
    }
    if (this.autoSync && /FROM\s+FOCUS_SESSIONS/.test(upper) && /ID IN/.test(upper)) {
      return asResult(params.map((id) => ({ id, user_id: TEST_USER_ID })));
    }
    if (this.autoSync && /INSERT INTO\s+SYNC_LOGS/.test(upper)) {
      return asResult([], 1);
    }
    if (this.handler) {
      return wrapRaw(this.handler(sql, params));
    }
    const raw = this.responses[this.callIndex] ?? [];
    this.callIndex += 1;
    return wrapRaw(raw);
  }
}

export function installHumanTestEnv(options?: {
  authMode?: "stub" | "jwt" | "";
  db?: ScriptedD1;
}): ScriptedD1 {
  const db = options?.db ?? new ScriptedD1([[]]);
  setTestEnv({
    DB: db as unknown as D1Database,
    ENVIRONMENT: "local",
    RESOURCE_ENV: "test",
    TEST_AUTH_MODE: options?.authMode ?? "stub",
    TEST_STUB_USER_ID: TEST_USER_ID,
    TEST_STUB_EMAIL: TEST_EMAIL,
    TEST_STUB_NAME: "E2E",
    TEST_RUN_ID: "l1",
    CF_ACCESS_TEAM_DOMAIN: "nocoo",
    CF_ACCESS_AUD: TEST_AUD,
    DASHBOARD_URL: "https://gecko.hexly.ai",
    DOVE_TEMPLATE_SLUG: "daily-analysis",
    DOVE_WEBHOOK_URL: "",
    DOVE_WEBHOOK_TOKEN: "",
  });
  return db;
}

export function mockD1(responses: unknown[] = [[]]): { calls: ScriptedCall[]; db: ScriptedD1 } {
  const db = new ScriptedD1(responses);
  patchTestEnv({ DB: db as unknown as D1Database });
  return { calls: db.calls, db };
}

export function mockD1BySql(handler: (sql: string, params: unknown[]) => unknown = () => []): {
  calls: ScriptedCall[];
  db: ScriptedD1;
} {
  const db = new ScriptedD1();
  db.handler = handler;
  patchTestEnv({ DB: db as unknown as D1Database });
  return { calls: db.calls, db };
}

export function mockExternalFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): { calls: ExternalFetchCall[] } {
  const calls: ExternalFetchCall[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push({ url, method: (init?.method ?? "GET").toUpperCase(), init });
    return handler(url, init);
  }) as typeof fetch;
  return { calls };
}

function toTestUrl(input: string): string {
  if (!/^https?:\/\//i.test(input)) {
    const path = input.startsWith("/") ? input : `/${input}`;
    return `http://127.0.0.1:17018${path}`;
  }
  const parsed = new URL(input);
  if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
    parsed.protocol = "http:";
    parsed.hostname = "127.0.0.1";
    parsed.port = "17018";
    return parsed.toString();
  }
  return input;
}

export function humanRequest(input: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  const method = (init?.method ?? "GET").toUpperCase();
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !headers.has("origin")) {
    headers.set("origin", "http://127.0.0.1:17018");
  }
  return new Request(toTestUrl(input), { ...init, headers });
}

export function machineRequest(input: string, init?: RequestInit): Request {
  const headers = new Headers(init?.headers);
  if (!headers.has("authorization")) {
    headers.set("authorization", "Bearer gk_test123");
  }
  return humanRequest(input, { ...init, headers });
}
