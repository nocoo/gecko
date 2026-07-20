import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// /api/settings/notifications route handler tests
// Note: this route uses auth() directly, not requireSession(), so
// E2E_SKIP_AUTH does not apply. We mock the auth module instead.
// ---------------------------------------------------------------------------

vi.mock("@/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "e2e-test-user" } })),
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.clearAllMocks();
});

function mockD1(responses: unknown[][] = [[]]) {
  let callIndex = 0;
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  globalThis.fetch = vi.fn((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql, params: body.params });

    const results = responses[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: results.length, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

function settingRow(key: string, value: string) {
  return { user_id: "e2e-test-user", key, value, updated_at: 1000 };
}

describe("/api/settings/notifications", () => {
  describe("GET", () => {
    test("returns notification settings", async () => {
      mockD1([
        [settingRow("ai.autoSummarize", "true")],
        [settingRow("notification.email.enabled", "true")],
        [settingRow("notification.email.address", "test@example.com")],
      ]);
      const { GET } = await import("../../app/api/settings/notifications/route");

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.autoSummarize).toBe(true);
      expect(data.emailEnabled).toBe(true);
      expect(data.emailAddress).toBe("test@example.com");
    });

    test("returns default values when no settings exist", async () => {
      mockD1([[], [], []]);
      const { GET } = await import("../../app/api/settings/notifications/route");

      const res = await GET();
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.autoSummarize).toBe(false);
      expect(data.emailEnabled).toBe(false);
      expect(data.emailAddress).toBe("");
    });

    test("returns 401 when not authenticated", async () => {
      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValueOnce(null as never);
      const { GET } = await import("../../app/api/settings/notifications/route");

      const res = await GET();
      expect(res.status).toBe(401);
    });
  });

  describe("PUT", () => {
    test("updates autoSummarize and emailEnabled fields", async () => {
      const { calls } = mockD1([
        [], // upsert autoSummarize
        [], // upsert emailEnabled
        [], // upsert emailAddress
        [settingRow("ai.autoSummarize", "true")],
        [settingRow("notification.email.enabled", "false")],
        [settingRow("notification.email.address", "new@example.com")],
      ]);
      const { PUT } = await import("../../app/api/settings/notifications/route");

      const req = new Request("http://localhost/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoSummarize: true,
          emailEnabled: false,
          emailAddress: "new@example.com",
        }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.autoSummarize).toBe(true);
      expect(data.emailEnabled).toBe(false);
      expect(data.emailAddress).toBe("new@example.com");

      // 3 upserts + 3 reads
      expect(calls.length).toBe(6);
    });

    test("deletes emailAddress when empty string provided", async () => {
      const { calls } = mockD1([
        [], // delete emailAddress
        [], // read autoSummarize
        [], // read emailEnabled
        [], // read emailAddress
      ]);
      const { PUT } = await import("../../app/api/settings/notifications/route");

      const req = new Request("http://localhost/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailAddress: "   " }),
      });

      const res = await PUT(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.emailAddress).toBe("");

      const c0 = calls[0];
      if (!c0) return;
      expect(c0.sql).toContain("DELETE");
    });

    test("returns 401 when not authenticated", async () => {
      const { auth } = await import("@/auth");
      vi.mocked(auth).mockResolvedValueOnce(null as never);
      const { PUT } = await import("../../app/api/settings/notifications/route");

      const req = new Request("http://localhost/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await PUT(req);
      expect(res.status).toBe(401);
    });
  });
});
