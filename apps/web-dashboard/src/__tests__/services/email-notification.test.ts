import { describe, expect, test, vi } from "vitest";
import { patchTestEnv } from "@/lib/runtime-env";
import type { AiAnalysisResult } from "@/services/analyze-core";
import type { DailyStats } from "@/services/daily-stats";
import {
  formatHighlights,
  formatImprovements,
  formatTimeSegments,
  type SendAnalysisEmailParams,
  sendAnalysisEmail,
} from "@/services/email-notification";
import { mockD1 } from "../test-env";

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

const optedIn = [
  [{ user_id: "user-123", key: "notification.email.enabled", value: "true", updated_at: 100 }],
  [
    {
      user_id: "user-123",
      key: "notification.email.address",
      value: "test@example.com",
      updated_at: 100,
    },
  ],
];

function enableDove(): void {
  patchTestEnv({
    DOVE_WEBHOOK_URL: "https://dove.hexly.ai/api/webhook/test/send",
    DOVE_WEBHOOK_TOKEN: "token",
    DOVE_TEMPLATE_SLUG: "daily-analysis",
    DASHBOARD_URL: "https://gecko.hexly.ai",
  });
}

function mockDove(status = 200): Array<{ url: string; body: unknown }> {
  const calls: Array<{ url: string; body: unknown }> = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return new Response("ok", { status });
  }) as typeof fetch;
  return calls;
}

describe("formatters", () => {
  test("formats highlights", () => {
    expect(formatHighlights(["A", "B"])).toBe("- A\n- B");
  });
  test("formats improvements", () => {
    expect(formatImprovements(["X", "Y"])).toBe("- X\n- Y");
  });
  test("formats time segments", () => {
    expect(
      formatTimeSegments([{ timeRange: "09:00-11:00", label: "Dev", description: "Coding" }]),
    ).toBe("| 09:00-11:00 | Dev | Coding |");
  });
});

describe("sendAnalysisEmail", () => {
  test("skips when Dove URL is missing", async () => {
    mockD1(optedIn);
    await sendAnalysisEmail(makeParams());
  });

  test("skips when user has no address", async () => {
    enableDove();
    mockD1([
      [{ user_id: "user-123", key: "notification.email.enabled", value: "true", updated_at: 100 }],
      [],
    ]);
    const calls = mockDove();
    await sendAnalysisEmail(makeParams());
    expect(calls).toHaveLength(0);
  });

  test("skips when email is disabled", async () => {
    enableDove();
    mockD1([
      [{ user_id: "user-123", key: "notification.email.enabled", value: "false", updated_at: 100 }],
      [
        {
          user_id: "user-123",
          key: "notification.email.address",
          value: "test@example.com",
          updated_at: 100,
        },
      ],
    ]);
    const calls = mockDove();
    await sendAnalysisEmail(makeParams());
    expect(calls).toHaveLength(0);
  });

  test("posts to Dove without logging the user id", async () => {
    enableDove();
    mockD1(optedIn);
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(" "));
    });
    const calls = mockDove();
    await sendAnalysisEmail(makeParams());
    spy.mockRestore();
    expect(calls).toHaveLength(1);
    const body = calls[0]?.body as {
      to: string;
      template: string;
      idempotency_key: string;
      variables: Record<string, string>;
    };
    expect(body.to).toBe("test@example.com");
    expect(body.template).toBe("daily-analysis");
    expect(body.idempotency_key).not.toContain("user-123");
    expect(body.variables.dashboard_url).toBe("https://gecko.hexly.ai/daily/2026-03-30");
    expect(logs.join(" ")).not.toContain("user-123");
    expect(logs.join(" ")).not.toContain("test@example.com");
  });

  test("falls back to default template slug and dashboard URL", async () => {
    patchTestEnv({
      DOVE_WEBHOOK_URL: "https://dove.hexly.ai/api/webhook/test/send",
      DOVE_WEBHOOK_TOKEN: "token",
      DOVE_TEMPLATE_SLUG: "",
      DASHBOARD_URL: "",
    });
    mockD1(optedIn);
    const calls = mockDove();
    await sendAnalysisEmail(makeParams());
    const body = calls[0]?.body as { template: string; variables: Record<string, string> };
    expect(body.template).toBe("daily-analysis");
    expect(body.variables.dashboard_url).toBe("https://gecko.hexly.ai/daily/2026-03-30");
  });

  test("uses dashboardBaseUrl override", async () => {
    enableDove();
    mockD1(optedIn);
    const calls = mockDove();
    await sendAnalysisEmail(makeParams({ dashboardBaseUrl: "https://gecko.dev.hexly.ai/" }));
    const body = calls[0]?.body as { variables: Record<string, string> };
    expect(body.variables.dashboard_url).toBe("https://gecko.dev.hexly.ai/daily/2026-03-30");
  });

  test("does not throw when Dove returns an error", async () => {
    enableDove();
    mockD1(optedIn);
    mockDove(500);
    await sendAnalysisEmail(makeParams());
  });

  test("does not throw when fetch rejects", async () => {
    enableDove();
    mockD1(optedIn);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;
    await sendAnalysisEmail(makeParams());
  });

  test("does not throw when fetch rejects with a non-Error", async () => {
    enableDove();
    mockD1(optedIn);
    globalThis.fetch = vi.fn(async () => {
      throw "nope";
    }) as typeof fetch;
    await sendAnalysisEmail(makeParams());
  });
});
