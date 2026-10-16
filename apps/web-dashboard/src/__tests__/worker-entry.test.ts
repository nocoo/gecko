import { beforeEach, describe, expect, test, vi } from "vitest";

const fetchMock = vi.fn(async () => new Response("ok"));
const tickMock = vi.fn(async () => {});

vi.mock("vinext/server/app-router-entry", () => ({
  default: { fetch: fetchMock },
}));

vi.mock("../lib/auto-analyze", () => ({
  runAutoAnalyzeTick: tickMock,
}));

describe("worker-entry", () => {
  beforeEach(() => {
    fetchMock.mockClear();
    tickMock.mockClear();
  });

  test("fetch delegates to the vinext app", async () => {
    const worker = await import("../../worker-entry");
    const request = new Request("http://127.0.0.1/api/live");
    const env = {} as Cloudflare.Env;
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    const response = await worker.default.fetch?.(request, env, ctx);
    expect(fetchMock).toHaveBeenCalledWith(request, env, ctx);
    expect(response?.status).toBe(200);
  });

  test("scheduled awaits runAutoAnalyzeTick", async () => {
    const worker = await import("../../worker-entry");
    const controller = { scheduledTime: 1_700_000_000_000, cron: "0 * * * *", noRetry() {} };
    const env = {} as Cloudflare.Env;
    const ctx = { waitUntil() {}, passThroughOnException() {} };
    await worker.default.scheduled?.(controller, env, ctx);
    expect(tickMock).toHaveBeenCalledWith(env, 1_700_000_000_000);
  });

  test("scheduled surfaces tick failures", async () => {
    tickMock.mockRejectedValueOnce(new Error("auto-analyze failed for 1 user(s)"));
    const worker = await import("../../worker-entry");
    const controller = { scheduledTime: 1, cron: "0 * * * *", noRetry() {} };
    await expect(
      worker.default.scheduled?.(controller, {} as Cloudflare.Env, {
        waitUntil() {},
        passThroughOnException() {},
      }),
    ).rejects.toThrow("auto-analyze failed");
  });
});
