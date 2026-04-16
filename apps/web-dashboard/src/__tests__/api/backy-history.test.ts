import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// /api/backy/history route handler tests
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

function mockFetchRouter(opts: {
  d1Responses?: unknown[][];
  externalStatus?: number;
  externalBody?: string;
  externalJson?: unknown;
  externalError?: Error;
}) {
  let d1CallIndex = 0;

  globalThis.fetch = mock(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    if (urlStr.includes("api.cloudflare.com")) {
      const _body = JSON.parse(init?.body as string);
      const results = opts.d1Responses?.[d1CallIndex] ?? [];
      d1CallIndex++;
      return new Response(
        JSON.stringify({
          success: true,
          result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      );
    }

    // External fetch (backy webhook)
    if (opts.externalError) {
      throw opts.externalError;
    }
    if (opts.externalJson) {
      return new Response(JSON.stringify(opts.externalJson), { status: opts.externalStatus ?? 200 });
    }
    return new Response(opts.externalBody ?? "", { status: opts.externalStatus ?? 200 });
  }) as unknown as typeof fetch;
}

describe("/api/backy/history", () => {
  describe("GET /api/backy/history", () => {
    test("returns 422 when backy push not configured", async () => {
      mockFetchRouter({ d1Responses: [[]] });
      const { GET } = await import("../../app/api/backy/history/route");

      const res = await GET();
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toContain("not configured");
    });

    test("returns history data when configured", async () => {
      mockFetchRouter({
        d1Responses: [
          [
            { key: "backy.webhookUrl", value: "https://backy.example.com/hook" },
            { key: "backy.apiKey", value: "key-123" },
          ],
        ],
        externalJson: { history: [{ id: 1, timestamp: "2026-01-01" }] },
      });
      const { GET } = await import("../../app/api/backy/history/route");

      const res = await GET();
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.history).toHaveLength(1);
    });

    test("returns 502 when backy responds with error status", async () => {
      mockFetchRouter({
        d1Responses: [
          [
            { key: "backy.webhookUrl", value: "https://backy.example.com/hook" },
            { key: "backy.apiKey", value: "key-123" },
          ],
        ],
        externalStatus: 500,
        externalBody: "Internal Server Error",
      });
      const { GET } = await import("../../app/api/backy/history/route");

      const res = await GET();
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain("500");
    });

    test("returns 502 when fetch throws an error", async () => {
      mockFetchRouter({
        d1Responses: [
          [
            { key: "backy.webhookUrl", value: "https://backy.example.com/hook" },
            { key: "backy.apiKey", value: "key-123" },
          ],
        ],
        externalError: new Error("Connection refused"),
      });
      const { GET } = await import("../../app/api/backy/history/route");

      const res = await GET();
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain("Connection refused");
    });
  });
});
