import { beforeAll, describe, expect, test } from "vitest";
import { humanApi, makeSession, syncSessions } from "./harness";

describe("E2E: Stats API", () => {
  beforeAll(async () => {
    const now = Math.floor(Date.now() / 1000);
    const res = await syncSessions([
      makeSession({
        app_name: "VS Code",
        bundle_id: "com.microsoft.VSCode",
        window_title: "main.ts",
        url: null,
        start_time: now - 600,
        duration: 600,
      }),
      makeSession({
        app_name: "Safari",
        bundle_id: "com.apple.Safari",
        window_title: "Example",
        url: "https://example.com",
        start_time: now - 300,
        duration: 300,
      }),
    ]);
    expect(res.status).toBe(202);
  });

  test("GET /api/stats returns today's stats", async () => {
    const res = await humanApi("/api/stats");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("today");
    expect(typeof body.totalSessions).toBe("number");
    expect(typeof body.totalDuration).toBe("number");
    expect(Array.isArray(body.topApps)).toBe(true);
  });

  test("GET /api/stats?period=week returns weekly stats", async () => {
    const res = await humanApi("/api/stats?period=week");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("week");
    expect(Array.isArray(body.topApps)).toBe(true);
  });

  test("GET /api/stats?period=invalid falls back to today", async () => {
    const res = await humanApi("/api/stats?period=invalid");
    expect(res.status).toBe(200);
    expect((await res.json()).period).toBe("today");
  });

  test("GET /api/stats/timeline returns daily timeline", async () => {
    const res = await humanApi("/api/stats/timeline");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("week");
    expect(typeof body.timezone).toBe("string");
    expect(Array.isArray(body.timeline)).toBe(true);
  });

  test("GET /api/stats/timeline?period=month returns monthly timeline", async () => {
    const res = await humanApi("/api/stats/timeline?period=month");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.period).toBe("month");
    expect(Array.isArray(body.timeline)).toBe(true);
  });
});
