import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// ---------------------------------------------------------------------------
// /api/daily/[date]/preview-prompt route handler tests
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

const tzRow = {
  user_id: "e2e-test-user",
  key: "timezone",
  value: "Asia/Shanghai",
  updated_at: 1000,
};

const sampleSessionRow = {
  id: "s1",
  app_name: "VSCode",
  bundle_id: "com.microsoft.VSCode",
  window_title: "test.ts",
  url: null,
  start_time: 1772157600,
  duration: 3600,
};

async function callPOST(date: string) {
  const { POST } = await import("../../app/api/daily/[date]/preview-prompt/route");
  const req = new Request(`http://localhost/api/daily/${date}/preview-prompt`, { method: "POST" });
  return POST(req, { params: Promise.resolve({ date }) });
}

describe("POST /api/daily/[date]/preview-prompt", () => {
  test("returns built prompt for valid date with sessions", async () => {
    mockD1([
      [tzRow], // getUserTimezone
      // settings.findByUserId and fetchSessionsForDate run in parallel.
      // Order of arrival is implementation-defined; both must be the right shape.
      [], // settings.findByUserId — empty AI settings
      [sampleSessionRow], // fetchSessionsForDate
      // loadAppContext: categories, tags, notes
      [],
      [],
      [],
    ]);

    const res = await callPOST("2026-02-27");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(typeof data.prompt).toBe("string");
    expect(data.prompt.length).toBeGreaterThan(0);
  });

  test("returns 400 for invalid date format", async () => {
    mockD1([[tzRow]]);

    const res = await callPOST("not-a-date");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Invalid date format");
  });

  test("returns 400 for future dates", async () => {
    mockD1([[tzRow]]);

    const res = await callPOST("2099-12-31");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Cannot analyze future dates");
  });

  test("returns 400 when no sessions found for date", async () => {
    mockD1([
      [tzRow],
      [], // settings
      [], // sessions — empty
    ]);

    const res = await callPOST("2026-02-20");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("No sessions found");
  });
});
