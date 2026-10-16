/**
 * Tests for backy-push.ts — push-to-backy orchestration.
 */

import { afterEach, describe, expect, test, vi } from "vitest";
import { executePush } from "@/lib/backy-push";
import { mockD1, mockExternalFetch } from "../test-env";

afterEach(() => {
  vi.unstubAllEnvs();
});

function mockPush(webhookHandler: (init: RequestInit) => Response | Promise<Response>) {
  mockD1(Array.from({ length: 20 }, () => []));
  mockExternalFetch((_url, init) => webhookHandler(init ?? {}));
}

describe("executePush", () => {
  test("returns 422 when push is not configured", async () => {
    mockD1([[]]);
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
    mockPush((init) => {
      webhookCalled = true;
      webhookHeaders = new Headers(init.headers);
      return new Response("ok", { status: 200 });
    });

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
    mockPush(() => new Response("server boom", { status: 500 }));

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
    mockPush(() => {
      const res = new Response(null, { status: 503 });
      res.text = () => Promise.reject(new Error("body read failed"));
      return res;
    });

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
    mockPush(() => {
      throw new Error("network down");
    });

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
    mockPush(() => {
      throw "raw string failure";
    });

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
    mockPush(async (init) => {
      const fd = init.body as FormData;
      observedEnv = fd.get("environment") as string;
      return new Response("ok", { status: 200 });
    });

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "k",
    });

    expect(result.ok).toBe(true);
    expect(observedEnv).toBe("prod");
  });

  test("treats a missing NODE_ENV as development", async () => {
    const previous = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    let observedEnv: string | undefined;
    mockPush(async (init) => {
      const fd = init.body as FormData;
      observedEnv = fd.get("environment") as string;
      return new Response("ok", { status: 200 });
    });

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "k",
    });

    expect(result.ok).toBe(true);
    expect(observedEnv).toBe("dev");
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  });

  test("falls back to 'dev' for an unknown NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "staging");
    let observedEnv: string | undefined;
    mockPush(async (init) => {
      const fd = init.body as FormData;
      observedEnv = fd.get("environment") as string;
      return new Response("ok", { status: 200 });
    });

    const result = await executePush("u1", {
      webhookUrl: "https://backy.example.com/push",
      apiKey: "k",
    });

    expect(result.ok).toBe(true);
    expect(observedEnv).toBe("dev");
  });
});
