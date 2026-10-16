import { describe, expect, test } from "vitest";
import { humanRequest, mockD1, mockExternalFetch } from "../test-env";

function mockFetchRouter(opts: {
  d1Responses?: unknown[][];
  externalStatus?: number;
  externalBody?: string;
  externalJson?: unknown;
  externalError?: Error;
}) {
  mockD1(opts.d1Responses ?? [[]]);
  mockExternalFetch(() => {
    if (opts.externalError) throw opts.externalError;
    if (opts.externalJson) {
      return new Response(JSON.stringify(opts.externalJson), {
        status: opts.externalStatus ?? 200,
      });
    }
    return new Response(opts.externalBody ?? "", { status: opts.externalStatus ?? 200 });
  });
}

describe("/api/backy/history", () => {
  describe("GET /api/backy/history", () => {
    test("returns 422 when backy push not configured", async () => {
      mockFetchRouter({ d1Responses: [[]] });
      const { GET } = await import("../../app/api/backy/history/route");

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
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

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
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

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
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

      const res = await GET(humanRequest("http://127.0.0.1:17018/"));
      expect(res.status).toBe(502);
      const data = await res.json();
      expect(data.error).toContain("Connection refused");
    });
  });
});
