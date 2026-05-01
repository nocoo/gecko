/**
 * Tests for /api/backy/config and /api/backy/test route handlers.
 */

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";

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

/**
 * Mock D1 with a URL-aware router:
 * - Cloudflare D1 API calls → return configured D1 responses
 * - Other URLs → return configured external responses
 */
function mockD1WithExternal(
  d1Responses: unknown[][] = [[]],
  externalHandler?: (url: string, init: RequestInit) => Response,
) {
  let d1CallIndex = 0;
  const d1Calls: Array<{ sql: string; params: unknown[] }> = [];
  const externalCalls: Array<{ url: string; method: string }> = [];

  globalThis.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    // D1 API calls
    if (urlStr.includes("api.cloudflare.com")) {
      const body = JSON.parse((init?.body ?? (url as Request).body) as string);
      d1Calls.push({ sql: body.sql, params: body.params });
      const results = d1Responses[d1CallIndex] ?? [];
      d1CallIndex++;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            result: [{ results, success: true, meta: { changes: results.length > 0 ? 1 : 0, last_row_id: 0 } }],
            errors: [],
          }),
          { status: 200 },
        ),
      );
    }

    // External calls (backy webhook)
    externalCalls.push({ url: urlStr, method: init?.method ?? "GET" });
    if (externalHandler) {
      return Promise.resolve(externalHandler(urlStr, init!));
    }
    return Promise.resolve(new Response("OK", { status: 200 }));
  }) as unknown as typeof fetch;

  return { d1Calls, externalCalls };
}

// ---------------------------------------------------------------------------
// /api/backy/config — GET
// ---------------------------------------------------------------------------

describe("/api/backy/config GET", () => {
  test("returns unconfigured state when no config exists", async () => {
    mockD1WithExternal([[]]);
    const { GET } = await import("../../app/api/backy/config/route");

    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.configured).toBe(false);
    expect(data.webhookUrl).toBe("");
    expect(data.apiKey).toBe("");
  });

  test("returns config with masked API key", async () => {
    mockD1WithExternal([[
      { key: "backy.webhookUrl", value: "https://backy.example.com/webhook" },
      { key: "backy.apiKey", value: "sk-test-secret-key-12345" },
    ]]);
    const { GET } = await import("../../app/api/backy/config/route");

    const res = await GET();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.configured).toBe(true);
    expect(data.webhookUrl).toBe("https://backy.example.com/webhook");
    // API key should be masked, showing only last 4 chars
    expect(data.apiKey).toContain("2345");
    expect(data.apiKey).toContain("•");
    expect(data.apiKey).not.toContain("sk-test");
  });

  test("returns unconfigured when only webhookUrl exists", async () => {
    mockD1WithExternal([[
      { key: "backy.webhookUrl", value: "https://backy.example.com/webhook" },
    ]]);
    const { GET } = await import("../../app/api/backy/config/route");

    const res = await GET();
    const data = await res.json();
    expect(data.configured).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// /api/backy/config — PUT
// ---------------------------------------------------------------------------

describe("/api/backy/config PUT", () => {
  test("saves valid config", async () => {
    const { d1Calls } = mockD1WithExternal([[], []]);
    const { PUT } = await import("../../app/api/backy/config/route");

    const req = new Request("http://localhost/api/backy/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        webhookUrl: "https://backy.example.com/webhook",
        apiKey: "sk-test-123",
      }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);

    // Should have made 2 D1 upsert calls (webhookUrl + apiKey)
    expect(d1Calls).toHaveLength(2);
    expect(d1Calls[0]).toBeDefined();
    if (!d1Calls[0]) return;
    expect(d1Calls[0].sql).toContain("backy.webhookUrl");
    expect(d1Calls[1]).toBeDefined();
    if (!d1Calls[1]) return;
    expect(d1Calls[1].sql).toContain("backy.apiKey");
  });

  test("rejects missing webhookUrl", async () => {
    mockD1WithExternal([]);
    const { PUT } = await import("../../app/api/backy/config/route");

    const req = new Request("http://localhost/api/backy/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "sk-test" }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("webhookUrl");
  });

  test("rejects missing apiKey", async () => {
    mockD1WithExternal([]);
    const { PUT } = await import("../../app/api/backy/config/route");

    const req = new Request("http://localhost/api/backy/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: "https://example.com" }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("apiKey");
  });

  test("rejects invalid URL", async () => {
    mockD1WithExternal([]);
    const { PUT } = await import("../../app/api/backy/config/route");

    const req = new Request("http://localhost/api/backy/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: "not-a-url", apiKey: "sk-test" }),
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid webhookUrl");
  });

  test("rejects invalid JSON body", async () => {
    mockD1WithExternal([]);
    const { PUT } = await import("../../app/api/backy/config/route");

    const req = new Request("http://localhost/api/backy/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await PUT(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Invalid JSON");
  });
});

// ---------------------------------------------------------------------------
// /api/backy/test — POST
// ---------------------------------------------------------------------------

describe("/api/backy/test POST", () => {
  test("returns ok when backy service responds 200", async () => {
    const { externalCalls } = mockD1WithExternal(
      [[
        { key: "backy.webhookUrl", value: "https://backy.example.com/webhook" },
        { key: "backy.apiKey", value: "sk-test-123" },
      ]],
      () => new Response(null, { status: 200 }),
    );
    const { POST } = await import("../../app/api/backy/test/route");

    const res = await POST();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.status).toBe(200);
    expect(typeof data.durationMs).toBe("number");

    // Verify external HEAD request was made
    expect(externalCalls).toHaveLength(1);
    expect(externalCalls[0]).toBeDefined();
    if (!externalCalls[0]) return;
    expect(externalCalls[0].url).toBe("https://backy.example.com/webhook");
    expect(externalCalls[0].method).toBe("HEAD");
  });

  test("returns ok=false when backy responds non-200", async () => {
    mockD1WithExternal(
      [[
        { key: "backy.webhookUrl", value: "https://backy.example.com/webhook" },
        { key: "backy.apiKey", value: "sk-test-123" },
      ]],
      () => new Response("Unauthorized", { status: 401 }),
    );
    const { POST } = await import("../../app/api/backy/test/route");

    const res = await POST();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.status).toBe(401);
  });

  test("returns 422 when push config is not configured", async () => {
    mockD1WithExternal([[]]);
    const { POST } = await import("../../app/api/backy/test/route");

    const res = await POST();
    expect(res.status).toBe(422);

    const data = await res.json();
    expect(data.error).toContain("not configured");
  });

  test("returns 502 when connection fails", async () => {
    mockD1WithExternal(
      [[
        { key: "backy.webhookUrl", value: "https://backy.example.com/webhook" },
        { key: "backy.apiKey", value: "sk-test-123" },
      ]],
      () => { throw new Error("ECONNREFUSED"); },
    );
    const { POST } = await import("../../app/api/backy/test/route");

    const res = await POST();
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toContain("ECONNREFUSED");
  });
});
