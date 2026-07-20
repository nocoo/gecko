/**
 * Tests for services/email-notification.ts — Dove email relay integration.
 *
 * Mocks: globalThis.fetch for Dove webhook, D1 queries for settingsRepo.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AiAnalysisResult } from "@/services/analyze-core";
import type { DailyStats } from "@/services/daily-stats";
import {
  formatHighlights,
  formatImprovements,
  formatTimeSegments,
  type SendAnalysisEmailParams,
  sendAnalysisEmail,
} from "@/services/email-notification";

const originalFetch = globalThis.fetch;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeParams(overrides?: Partial<SendAnalysisEmailParams>): SendAnalysisEmailParams {
  return {
    userId: "user-123",
    date: "2026-03-30",
    result: {
      score: 78,
      highlights: ["Deep focus on frontend", "No social media"],
      improvements: ["Take more breaks", "Start earlier"],
      timeSegments: [
        { timeRange: "09:00-11:30", label: "Frontend dev", description: "React components" },
        { timeRange: "14:00-16:00", label: "Documentation", description: "API docs" },
      ],
      summary: "Productive day with strong morning focus.",
    } satisfies AiAnalysisResult,
    stats: {
      date: "2026-03-30",
      totalDuration: 28800,
      totalSessions: 42,
      totalApps: 8,
      activeSpan: 32400,
      scores: { focus: 80, deepWork: 75, switchRate: 70, concentration: 85, overall: 78 },
      topApps: [],
      sessions: [],
    } satisfies DailyStats,
    ...overrides,
  };
}

/**
 * Mock D1 for settingsRepo queries.
 * Returns the provided rows for sequential DB calls.
 */
function mockD1(responses: unknown[][]) {
  let callIndex = 0;
  const fetchCalls: Array<{ url: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

    // Dove webhook call (non-D1)
    if (!urlStr.includes("cloudflare")) {
      fetchCalls.push({
        url: urlStr,
        body: init?.body ? JSON.parse(init.body as string) : {},
      });
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    }

    // D1 call
    const body = init?.body ? JSON.parse(init.body as string) : {};
    fetchCalls.push({ url: urlStr, body });

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

  return { fetchCalls };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
  process.env.DOVE_WEBHOOK_URL = "https://dove.hexly.ai/api/webhook/proj-1/send";
  process.env.DOVE_WEBHOOK_TOKEN = "test-dove-token";
  process.env.NEXTAUTH_URL = "https://gecko.dev.hexly.ai";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.DOVE_WEBHOOK_URL;
  delete process.env.DOVE_WEBHOOK_TOKEN;
});

// ---------------------------------------------------------------------------
// Pure formatter tests
// ---------------------------------------------------------------------------

describe("formatHighlights", () => {
  test("formats array as Markdown bullet list", () => {
    expect(formatHighlights(["A", "B"])).toBe("- A\n- B");
  });
});

describe("formatImprovements", () => {
  test("formats array as Markdown bullet list", () => {
    expect(formatImprovements(["X", "Y"])).toBe("- X\n- Y");
  });
});

describe("formatTimeSegments", () => {
  test("formats segments as Markdown table rows", () => {
    const result = formatTimeSegments([
      { timeRange: "09:00-11:00", label: "Dev", description: "Coding" },
    ]);
    expect(result).toBe("| 09:00-11:00 | Dev | Coding |");
  });
});

// ---------------------------------------------------------------------------
// sendAnalysisEmail
// ---------------------------------------------------------------------------

describe("sendAnalysisEmail", () => {
  test("silently skips when DOVE_WEBHOOK_URL is missing", async () => {
    delete process.env.DOVE_WEBHOOK_URL;
    const { fetchCalls } = mockD1([]);
    await sendAnalysisEmail(makeParams());
    // No fetch calls at all (neither D1 nor Dove)
    expect(fetchCalls).toHaveLength(0);
  });

  test("silently skips when DOVE_WEBHOOK_TOKEN is missing", async () => {
    delete process.env.DOVE_WEBHOOK_TOKEN;
    const { fetchCalls } = mockD1([]);
    await sendAnalysisEmail(makeParams());
    expect(fetchCalls).toHaveLength(0);
  });

  test("skips when user has no email address configured", async () => {
    const { fetchCalls } = mockD1([
      // notification.email.enabled
      [{ user_id: "user-123", key: "notification.email.enabled", value: "true", updated_at: 100 }],
      // notification.email.address → not found
      [],
    ]);
    await sendAnalysisEmail(makeParams());
    // Only D1 calls, no Dove webhook call
    const doveCalls = fetchCalls.filter((c) => c.url.includes("dove"));
    expect(doveCalls).toHaveLength(0);
  });

  test("skips when notification.email.enabled is false", async () => {
    const { fetchCalls } = mockD1([
      // notification.email.enabled = false
      [{ user_id: "user-123", key: "notification.email.enabled", value: "false", updated_at: 100 }],
      // notification.email.address
      [
        {
          user_id: "user-123",
          key: "notification.email.address",
          value: "test@example.com",
          updated_at: 100,
        },
      ],
    ]);
    await sendAnalysisEmail(makeParams());
    const doveCalls = fetchCalls.filter((c) => c.url.includes("dove"));
    expect(doveCalls).toHaveLength(0);
  });

  test("sends correct Dove webhook request on success", async () => {
    const { fetchCalls } = mockD1([
      // notification.email.enabled
      [{ user_id: "user-123", key: "notification.email.enabled", value: "true", updated_at: 100 }],
      // notification.email.address
      [
        {
          user_id: "user-123",
          key: "notification.email.address",
          value: "test@example.com",
          updated_at: 100,
        },
      ],
    ]);

    await sendAnalysisEmail(makeParams());

    const doveCalls = fetchCalls.filter((c) => c.url.includes("dove"));
    expect(doveCalls).toHaveLength(1);

    const call = doveCalls[0]!;
    expect(call.url).toBe("https://dove.hexly.ai/api/webhook/proj-1/send");

    const body = call.body as Record<string, unknown>;
    expect(body.to).toBe("test@example.com");
    expect(body.template).toBe("daily-analysis");
    expect(body.idempotency_key).toBe("gecko-analysis-user-123-2026-03-30");

    const vars = body.variables as Record<string, unknown>;
    expect(vars.date).toBe("2026-03-30");
    expect(vars.score).toBe("78");
    expect(vars.total_duration).toBe("8h");
    expect(vars.total_apps).toBe("8");
    expect(vars.dashboard_url).toBe("https://gecko.dev.hexly.ai/daily/2026-03-30");
  });

  test("idempotency key contains userId and date", async () => {
    const { fetchCalls } = mockD1([
      [{ user_id: "user-123", key: "notification.email.enabled", value: "true", updated_at: 100 }],
      [
        {
          user_id: "user-123",
          key: "notification.email.address",
          value: "test@example.com",
          updated_at: 100,
        },
      ],
    ]);

    await sendAnalysisEmail(makeParams({ userId: "u-abc", date: "2026-01-15" }));

    const doveCalls = fetchCalls.filter((c) => c.url.includes("dove"));
    const body = doveCalls[0]!.body as Record<string, unknown>;
    expect(body.idempotency_key).toBe("gecko-analysis-u-abc-2026-01-15");
  });

  test("formats variables correctly", async () => {
    const { fetchCalls } = mockD1([
      [{ user_id: "user-123", key: "notification.email.enabled", value: "true", updated_at: 100 }],
      [
        {
          user_id: "user-123",
          key: "notification.email.address",
          value: "test@example.com",
          updated_at: 100,
        },
      ],
    ]);

    await sendAnalysisEmail(makeParams());

    const doveCalls = fetchCalls.filter((c) => c.url.includes("dove"));
    const vars = (doveCalls[0]!.body as Record<string, unknown>).variables as Record<
      string,
      unknown
    >;

    // highlights → Markdown list
    expect(vars.highlights).toContain("- Deep focus on frontend");
    expect(vars.highlights).toContain("- No social media");

    // improvements → Markdown list
    expect(vars.improvements).toContain("- Take more breaks");

    // time_segments → Markdown table rows
    expect(vars.time_segments).toContain("| 09:00-11:30 | Frontend dev | React components |");

    // summary
    expect(vars.summary).toBe("Productive day with strong morning focus.");
  });

  test("does not throw when Dove returns an error", async () => {
    // Override fetch to return error for Dove calls
    let callIndex = 0;
    globalThis.fetch = vi.fn((url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (!urlStr.includes("cloudflare")) {
        // Dove webhook — return 500
        return Promise.resolve(new Response("Internal Server Error", { status: 500 }));
      }

      // D1 mock
      const responses: unknown[][] = [
        [
          {
            user_id: "user-123",
            key: "notification.email.enabled",
            value: "true",
            updated_at: 100,
          },
        ],
        [
          {
            user_id: "user-123",
            key: "notification.email.address",
            value: "test@example.com",
            updated_at: 100,
          },
        ],
      ];
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

    // Should not throw
    await sendAnalysisEmail(makeParams());
  });

  test("does not throw when fetch itself throws", async () => {
    // Override fetch to reject for Dove calls
    let callIndex = 0;
    globalThis.fetch = vi.fn((url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (!urlStr.includes("cloudflare")) {
        // Dove webhook — network error
        return Promise.reject(new Error("Network failure"));
      }

      // D1 mock
      const responses: unknown[][] = [
        [
          {
            user_id: "user-123",
            key: "notification.email.enabled",
            value: "true",
            updated_at: 100,
          },
        ],
        [
          {
            user_id: "user-123",
            key: "notification.email.address",
            value: "test@example.com",
            updated_at: 100,
          },
        ],
      ];
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

    // Should not throw
    await sendAnalysisEmail(makeParams());
  });

  test("does not throw when fetch rejects with non-Error value", async () => {
    let callIndex = 0;
    globalThis.fetch = vi.fn((url: string | URL | Request, _init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

      if (!urlStr.includes("cloudflare")) {
        // Reject with a plain string — exercises the `: err` fallback branch.
        return Promise.reject("string failure");
      }

      const responses: unknown[][] = [
        [
          {
            user_id: "user-123",
            key: "notification.email.enabled",
            value: "true",
            updated_at: 100,
          },
        ],
        [
          {
            user_id: "user-123",
            key: "notification.email.address",
            value: "test@example.com",
            updated_at: 100,
          },
        ],
      ];
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

    await sendAnalysisEmail(makeParams());
  });

  test("falls back to default dashboard URL when neither param nor NEXTAUTH_URL is set", async () => {
    delete process.env.NEXTAUTH_URL;
    const { fetchCalls } = mockD1([
      [{ user_id: "user-123", key: "notification.email.enabled", value: "true", updated_at: 100 }],
      [
        {
          user_id: "user-123",
          key: "notification.email.address",
          value: "test@example.com",
          updated_at: 100,
        },
      ],
    ]);

    await sendAnalysisEmail(makeParams());

    const doveCall = fetchCalls.find((c) => c.url.includes("dove"));
    if (!doveCall) throw new Error("expected Dove call");
    const vars = (doveCall.body as { variables: Record<string, string> }).variables;
    expect(vars.dashboard_url).toBe("https://gecko.hexly.ai/daily/2026-03-30");
  });
});
