import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/apps route handler tests
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.E2E_SKIP_AUTH = "true";
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  delete process.env.E2E_SKIP_AUTH;
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
          result: [
            {
              results,
              success: true,
              meta: { changes: results.length, last_row_id: 0 },
            },
          ],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

describe("/api/apps", () => {
  describe("GET /api/apps", () => {
    test("returns list of unique apps ordered by total duration", async () => {
      mockD1([
        [
          {
            bundle_id: "com.google.Chrome",
            app_name: "Google Chrome",
            total_duration: 50000,
            session_count: 100,
          },
          {
            bundle_id: "com.microsoft.VSCode",
            app_name: "Visual Studio Code",
            total_duration: 30000,
            session_count: 80,
          },
        ],
      ]);
      const { GET } = await import("../../app/api/apps/route");

      const req = new Request("http://localhost/api/apps");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.apps).toHaveLength(2);
      expect(data.apps[0].bundleId).toBe("com.google.Chrome");
      expect(data.apps[0].appName).toBe("Google Chrome");
      expect(data.apps[0].totalDuration).toBe(50000);
      expect(data.apps[0].sessionCount).toBe(100);
      expect(data.apps[1].bundleId).toBe("com.microsoft.VSCode");
    });

    test("returns empty array when no tracked apps", async () => {
      mockD1([[]]);
      const { GET } = await import("../../app/api/apps/route");

      const req = new Request("http://localhost/api/apps");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.apps).toEqual([]);
    });

    test("filters by user_id and excludes null/empty bundle_ids", async () => {
      const { calls } = mockD1([[]]);
      const { GET } = await import("../../app/api/apps/route");

      const req = new Request("http://localhost/api/apps");
      await GET(req);

      expect(calls).toHaveLength(1);
      expect(calls[0].sql).toContain("user_id = ?");
      expect(calls[0].sql).toContain("bundle_id IS NOT NULL");
      expect(calls[0].sql).toContain("bundle_id != ''");
      expect(calls[0].params).toEqual(["e2e-test-user"]);
    });

    test("groups by bundle_id and sums duration", async () => {
      const { calls } = mockD1([[]]);
      const { GET } = await import("../../app/api/apps/route");

      const req = new Request("http://localhost/api/apps");
      await GET(req);

      expect(calls[0].sql).toContain("GROUP BY bundle_id");
      expect(calls[0].sql).toContain("SUM(duration)");
      expect(calls[0].sql).toContain("ORDER BY total_duration DESC");
    });
  });
});
