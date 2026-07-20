/**
 * Tests for backy-push.ts — push-to-backy orchestration.
 *
 * Mocks D1 (for backyRepo + backy-export queries) and the backy webhook
 * fetch via the same globalThis.fetch handle.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { executePush } from "@/lib/backy-push";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

/**
 * Mock fetch that responds to:
 *  - D1 SQL endpoints (POST with body.sql) → return the next queued result row
 *  - everything else (the backy webhook) → caller-provided handler
 */
function mockFetch(
  d1Responses: unknown[][],
  webhookHandler: (init: RequestInit) => Response | Promise<Response>,
) {
  let d1Idx = 0;
  globalThis.fetch = vi.fn(async (_url: string, init: RequestInit) => {
    if (init.body && typeof init.body === "string") {
      // D1 calls are JSON with sql field
      try {
        const body = JSON.parse(init.body);
        if (body.sql) {
          const results = d1Responses[d1Idx] ?? [];
          d1Idx++;
          return new Response(
            JSON.stringify({
              success: true,
              result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
              errors: [],
            }),
            { status: 200 },
          );
        }
      } catch {
        // not JSON — fall through to webhook handler
      }
    }
    return webhookHandler(init);
  }) as unknown as typeof fetch;
}

describe("executePush", () => {
  test("returns 422 when push is not configured", async () => {
    // backyRepo.getPushConfig → empty result → no config
    mockFetch([[]], () => new Response("", { status: 200 }));

    const result = await executePush("u1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.error).toContain("not configured");
    }
  });

  test("succeeds with explicit config and uploads to webhook", async () => {
    let webhookCalled = false;
    let webhookHeaders: Headers | undefined;
    mockFetch(
      [
        // exportUserData — many SELECTs all returning empty.
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
      ],
      (init) => {
        webhookCalled = true;
        webhookHeaders = new Headers(init.headers);
        return new Response("ok", { status: 200 });
      },
    );

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileName).toMatch(/\.gz$/);
      expect(result.tag).toBeDefined();
      expect(typeof result.compressedBytes).toBe("number");
      expect(typeof result.durationMs).toBe("number");
    }
    expect(webhookCalled).toBe(true);
    expect(webhookHeaders!.get("authorization")).toBe("Bearer test-key");
  });

  test("returns 502 when backy responds with non-2xx", async () => {
    mockFetch(
      [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []],
      () => new Response("server boom", { status: 500 }),
    );

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toContain("500");
      expect(result.error).toContain("server boom");
    }
  });

  test("returns 502 with body fallback when response.text() throws", async () => {
    mockFetch(
      [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []],
      () => {
        // Simulate Response whose .text() throws to exercise the catch.
        const res = new Response(null, { status: 503 });
        res.text = () => Promise.reject(new Error("body read failed"));
        return res;
      },
    );

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown error");
    }
  });

  test("returns 502 when fetch throws an Error", async () => {
    mockFetch(
      [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []],
      () => {
        throw new Error("network down");
      },
    );

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toContain("network down");
    }
  });

  test("returns 502 with 'Unknown error' when fetch throws a non-Error", async () => {
    mockFetch(
      [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []],
      () => {
        // throwing a string exercises the `err instanceof Error ? ... : "Unknown error"` branch
        throw "raw string failure";
      },
    );

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "test-key",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Unknown error");
    }
  });

  test("uses 'prod' env mapping for production NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "production");
    let observedEnv: string | undefined;
    mockFetch(
      [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []],
      async (init) => {
        const fd = init.body as FormData;
        observedEnv = fd.get("environment") as string;
        return new Response("ok", { status: 200 });
      },
    );

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "k",
    });

    expect(result.ok).toBe(true);
    expect(observedEnv).toBe("prod");
  });

  test("falls back to 'dev' for an unknown NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    let observedEnv: string | undefined;
    mockFetch(
      [[], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], [], []],
      async (init) => {
        const fd = init.body as FormData;
        observedEnv = fd.get("environment") as string;
        return new Response("ok", { status: 200 });
      },
    );

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "k",
    });

    expect(result.ok).toBe(true);
    expect(observedEnv).toBe("dev");
  });
});
