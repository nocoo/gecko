interface D1Meta {
  changes: number;
  last_row_id: number;
  [key: string]: unknown;
}

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: D1Meta;
  error?: string;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = unknown>(): Promise<D1Result<T>>;
  run<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface ScheduledController {
  readonly scheduledTime: number;
  readonly cron: string;
  noRetry(): void;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ExportedHandler<Env = unknown> {
  fetch?(request: Request, env: Env, ctx: ExecutionContext): Response | Promise<Response>;
  scheduled?(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): void | Promise<void>;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ASSETS?: Fetcher;
    ENVIRONMENT: string;
    RESOURCE_ENV: string;
    CF_ACCESS_TEAM_DOMAIN: string;
    CF_ACCESS_AUD: string;
    DASHBOARD_URL: string;
    DOVE_TEMPLATE_SLUG: string;
    DOVE_WEBHOOK_URL: string;
    DOVE_WEBHOOK_TOKEN: string;
    TEST_AUTH_MODE?: string;
    TEST_RUN_ID?: string;
    TEST_STUB_USER_ID?: string;
    TEST_STUB_EMAIL?: string;
    TEST_STUB_NAME?: string;
    CF_ACCESS_JWKS_URL?: string;
    LOCAL_USER_EMAIL?: string;
    LOCAL_USER_NAME?: string;
  }
}

declare module "cloudflare:workers" {
  export const env: Cloudflare.Env;
}
