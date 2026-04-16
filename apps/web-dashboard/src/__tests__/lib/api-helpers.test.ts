import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// API helpers tests — auth extraction for route handlers
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockD1(responses: unknown[][] = [[]]) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = mock((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    const results = responses[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

// We test the pure logic functions, not the NextAuth integration directly.

describe("api-helpers", () => {
  // ---------------------------------------------------------------------------
  // requireSession() logic
  // ---------------------------------------------------------------------------

  describe("requireSession logic", () => {
    // Simulates the session extraction logic
    function extractUserId(
      session: { user?: { id?: string } } | null,
      skipAuth: boolean
    ): { userId: string } | { error: string; status: number } {
      if (skipAuth) {
        return { userId: "e2e-test-user" };
      }
      if (!session?.user?.id) {
        return { error: "Unauthorized", status: 401 };
      }
      return { userId: session.user.id };
    }

    test("returns userId from valid session", () => {
      const result = extractUserId({ user: { id: "google-123" } }, false);
      expect(result).toEqual({ userId: "google-123" });
    });

    test("returns 401 when session is null", () => {
      const result = extractUserId(null, false);
      expect(result).toEqual({ error: "Unauthorized", status: 401 });
    });

    test("returns 401 when session has no user", () => {
      const result = extractUserId({}, false);
      expect(result).toEqual({ error: "Unauthorized", status: 401 });
    });

    test("returns 401 when user has no id", () => {
      const result = extractUserId({ user: {} }, false);
      expect(result).toEqual({ error: "Unauthorized", status: 401 });
    });

    test("returns e2e-test-user when skipAuth is true", () => {
      const result = extractUserId(null, true);
      expect(result).toEqual({ userId: "e2e-test-user" });
    });
  });

  // ---------------------------------------------------------------------------
  // requireSession() — actual function, E2E mode
  // ---------------------------------------------------------------------------

  describe("requireSession() actual", () => {
    let requireSession: typeof import("../../lib/api-helpers")["requireSession"];

    beforeEach(async () => {
      process.env.E2E_SKIP_AUTH = "true";
      const mod = await import("../../lib/api-helpers");
      requireSession = mod.requireSession;
    });

    afterEach(() => {
      delete process.env.E2E_SKIP_AUTH;
    });

    test("returns e2e-test-user in E2E mode", async () => {
      const result = await requireSession();
      expect(result.user).toBeDefined();
      expect(result.user!.userId).toBe("e2e-test-user");
      expect(result.error).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // requireSession() — non-E2E mode (mocked auth)
  // ---------------------------------------------------------------------------

  describe("requireSession() non-E2E", () => {
    test("returns 401 when auth() returns null session", async () => {
      delete process.env.E2E_SKIP_AUTH;
      mock.module("@/auth", () => ({
        auth: () => Promise.resolve(null),
      }));
      const { requireSession } = await import("../../lib/api-helpers");
      const result = await requireSession();
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(401);
    });

    test("returns userId when auth() returns valid session", async () => {
      delete process.env.E2E_SKIP_AUTH;
      mock.module("@/auth", () => ({
        auth: () => Promise.resolve({ user: { id: "google-user-42" } }),
      }));
      const { requireSession } = await import("../../lib/api-helpers");
      const result = await requireSession();
      expect(result.user).toBeDefined();
      expect(result.user!.userId).toBe("google-user-42");
    });
  });

  // ---------------------------------------------------------------------------
  // requireApiKey() — E2E mode
  // ---------------------------------------------------------------------------

  describe("requireApiKey() E2E mode", () => {
    let requireApiKey: (req: Request) => Promise<{ user?: { userId: string; deviceId: string }; error?: Response }>;

    beforeEach(async () => {
      process.env.E2E_SKIP_AUTH = "true";
      const mod = await import("../../lib/api-helpers");
      requireApiKey = mod.requireApiKey;
    });

    afterEach(() => {
      delete process.env.E2E_SKIP_AUTH;
    });

    test("returns e2e user in E2E mode", async () => {
      const req = new Request("http://localhost");
      const result = await requireApiKey(req);
      expect(result.user).toBeDefined();
      expect(result.user!.userId).toBe("e2e-test-user");
      expect(result.user!.deviceId).toBe("e2e-test-device");
    });
  });

  // ---------------------------------------------------------------------------
  // requireApiKey() — non-E2E mode
  // ---------------------------------------------------------------------------

  describe("requireApiKey() auth mode", () => {
    let requireApiKey: (req: Request) => Promise<{ user?: { userId: string; deviceId: string }; error?: Response }>;

    beforeEach(async () => {
      delete process.env.E2E_SKIP_AUTH;
      const mod = await import("../../lib/api-helpers");
      requireApiKey = mod.requireApiKey;
    });

    test("returns 401 when no Authorization header", async () => {
      const req = new Request("http://localhost");
      const result = await requireApiKey(req);
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(401);
      const body = await result.error!.json() as { error: string };
      expect(body.error).toContain("Missing or invalid Authorization");
    });

    test("returns 401 when API key is invalid", async () => {
      mockD1([[]]);  // No matching key
      const req = new Request("http://localhost", {
        headers: { Authorization: "Bearer gk_invalid_key_12345" },
      });
      const result = await requireApiKey(req);
      expect(result.error).toBeDefined();
      expect(result.error!.status).toBe(401);
      const body = await result.error!.json() as { error: string };
      expect(body.error).toContain("Invalid API key");
    });

    test("returns user when API key is valid", async () => {
      mockD1([
        // api_keys lookup
        [{ id: "key-1", user_id: "user-123", device_id: "macbook-1" }],
        // last_used update (fire-and-forget)
        [],
      ]);
      const req = new Request("http://localhost", {
        headers: { Authorization: "Bearer gk_valid_key_12345" },
      });
      const result = await requireApiKey(req);
      expect(result.user).toBeDefined();
      expect(result.user!.userId).toBe("user-123");
      expect(result.user!.deviceId).toBe("macbook-1");
    });
  });

  // ---------------------------------------------------------------------------
  // API key extraction from header
  // ---------------------------------------------------------------------------

  describe("extractBearerToken()", () => {
    // Import after module exists
    let extractBearerToken: (req: Request) => string | null;

    beforeEach(async () => {
      const mod = await import("../../lib/api-helpers");
      extractBearerToken = mod.extractBearerToken;
    });

    test("extracts token from valid Authorization header", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: "Bearer gk_abc123" },
      });
      expect(extractBearerToken(req)).toBe("gk_abc123");
    });

    test("returns null when no Authorization header", () => {
      const req = new Request("http://localhost");
      expect(extractBearerToken(req)).toBeNull();
    });

    test("returns null for non-Bearer scheme", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: "Basic abc123" },
      });
      expect(extractBearerToken(req)).toBeNull();
    });

    test("returns null for empty Bearer value", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: "Bearer " },
      });
      expect(extractBearerToken(req)).toBeNull();
    });

    test("handles case-insensitive Bearer prefix", () => {
      const req = new Request("http://localhost", {
        headers: { Authorization: "bearer gk_abc123" },
      });
      expect(extractBearerToken(req)).toBe("gk_abc123");
    });
  });

  // ---------------------------------------------------------------------------
  // JSON response helpers
  // ---------------------------------------------------------------------------

  describe("json response helpers", () => {
    let jsonOk: (data: unknown, status?: number) => Response;
    let jsonError: (message: string, status: number) => Response;

    beforeEach(async () => {
      const mod = await import("../../lib/api-helpers");
      jsonOk = mod.jsonOk;
      jsonError = mod.jsonError;
    });

    test("jsonOk returns 200 with data", async () => {
      const res = jsonOk({ foo: "bar" });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ foo: "bar" });
    });

    test("jsonOk supports custom status", async () => {
      const res = jsonOk({ created: true }, 201);
      expect(res.status).toBe(201);
    });

    test("jsonError returns error envelope", async () => {
      const res = jsonError("Not found", 404);
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Not found" });
    });
  });

  // ---------------------------------------------------------------------------
  // getUserTimezone()
  // ---------------------------------------------------------------------------

  describe("getUserTimezone()", () => {
    let getUserTimezone: (userId: string) => Promise<string>;

    beforeEach(async () => {
      process.env.E2E_SKIP_AUTH = "true";
      const mod = await import("../../lib/api-helpers");
      getUserTimezone = mod.getUserTimezone;
    });

    afterEach(() => {
      delete process.env.E2E_SKIP_AUTH;
    });

    test("returns user's timezone from settings", async () => {
      mockD1([
        [{ user_id: "u1", key: "timezone", value: "America/New_York", updated_at: 100 }],
      ]);
      const tz = await getUserTimezone("u1");
      expect(tz).toBe("America/New_York");
    });

    test("falls back to default when no setting", async () => {
      mockD1([[]]);
      const tz = await getUserTimezone("u1");
      expect(tz).toBe("Asia/Shanghai");
    });

    test("falls back to default for invalid timezone", async () => {
      mockD1([
        [{ user_id: "u1", key: "timezone", value: "Invalid/Timezone", updated_at: 100 }],
      ]);
      const tz = await getUserTimezone("u1");
      expect(tz).toBe("Asia/Shanghai");
    });

    test("falls back to default on DB error", async () => {
      globalThis.fetch = mock(() => {
        return Promise.reject(new Error("DB connection failed"));
      }) as unknown as typeof fetch;
      const tz = await getUserTimezone("u1");
      expect(tz).toBe("Asia/Shanghai");
    });
  });
});
