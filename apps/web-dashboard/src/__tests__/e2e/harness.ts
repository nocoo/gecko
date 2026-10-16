const testUrl = process.env.GECKO_TEST_URL;
if (!testUrl) {
  throw new Error("GECKO_TEST_URL is required; run via bun run test:l2|test:l3");
}
export const BASE_URL = testUrl;

export const TEST_JWT = process.env.GECKO_TEST_JWT ?? "";
export const TEST_API_KEY = process.env.GECKO_TEST_API_KEY ?? "";

export function humanHeaders(extra?: HeadersInit): HeadersInit {
  return {
    origin: BASE_URL,
    "cf-access-jwt-assertion": TEST_JWT,
    ...extra,
  };
}

export function machineHeaders(extra?: HeadersInit): HeadersInit {
  return {
    Authorization: `Bearer ${TEST_API_KEY}`,
    ...extra,
  };
}

export function api(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE_URL}${path}`, init);
}

export function humanApi(path: string, init?: RequestInit): Promise<Response> {
  return api(path, { ...init, headers: humanHeaders(init?.headers) });
}

export function machineApi(path: string, init?: RequestInit): Promise<Response> {
  return api(path, { ...init, headers: machineHeaders(init?.headers) });
}

export function jsonBody(method: string, body: unknown, extra?: HeadersInit): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json", ...extra },
    body: JSON.stringify(body),
  };
}

export interface SyncSessionFixture {
  id: string;
  app_name: string;
  window_title: string;
  url: string | null;
  start_time: number;
  duration: number;
  bundle_id: string | null;
  tab_title: string | null;
  tab_count: number | null;
  document_path: string | null;
  is_full_screen: boolean;
  is_minimized: boolean;
  [key: string]: unknown;
}

export function makeSession(overrides: Partial<SyncSessionFixture> = {}): SyncSessionFixture {
  return {
    id: crypto.randomUUID(),
    app_name: "E2E Test App",
    window_title: "Test Window",
    url: "https://example.com",
    start_time: Math.floor(Date.now() / 1000) - 3600,
    duration: 300.5,
    bundle_id: "com.e2e.test",
    tab_title: null,
    tab_count: null,
    document_path: null,
    is_full_screen: false,
    is_minimized: false,
    ...overrides,
  };
}

export function syncSessions(sessions: Record<string, unknown>[]): Promise<Response> {
  return machineApi("/api/sync", jsonBody("POST", { sessions }));
}
