import { describe, expect, test } from "vitest";
import { machineApi, makeSession, syncSessions } from "./harness";

describe("E2E: GET /api/v1/snapshot", () => {
  const todayStr = new Date().toISOString().slice(0, 10);

  test("syncs sessions then returns today's snapshot", async () => {
    const res = await syncSessions([
      makeSession({ app_name: "Safari", bundle_id: "com.apple.Safari" }),
    ]);
    expect(res.status).toBe(202);

    const snap = await machineApi(`/api/v1/snapshot?date=${todayStr}`);
    expect(snap.status).toBe(200);
    const body = await snap.json();
    expect(body.date).toBe(todayStr);
    expect(body.timezone).toBeDefined();
    expect(typeof body.stats.totalSessions).toBe("number");
    expect(typeof body.stats.totalDuration).toBe("number");
    expect(Array.isArray(body.stats.topApps)).toBe(true);
  });

  test("returns 400 for missing date param", async () => {
    const res = await machineApi("/api/v1/snapshot");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  test("returns 400 for invalid date format", async () => {
    const res = await machineApi("/api/v1/snapshot?date=not-a-date");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });

  test("returns 400 for future date", async () => {
    const res = await machineApi("/api/v1/snapshot?date=2099-01-01");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBeDefined();
  });
});
