import { beforeAll, describe, expect, test } from "vitest";
import { humanApi, jsonBody, makeSession, syncSessions } from "./harness";

const SEED_DATE_EPOCH_START = 1772121600;

describe("GET /api/daily/:date", () => {
  beforeAll(async () => {
    const res = await syncSessions([
      makeSession({
        app_name: "VS Code",
        bundle_id: "com.microsoft.VSCode",
        window_title: "daily-review.test.ts",
        url: null,
        start_time: SEED_DATE_EPOCH_START + 3600 * 2,
        duration: 3600,
      }),
      makeSession({
        app_name: "Safari",
        bundle_id: "com.apple.Safari",
        window_title: "GitHub PR Review",
        url: "https://github.com/example/pr/1",
        start_time: SEED_DATE_EPOCH_START + 3600 * 6,
        duration: 1800,
      }),
    ]);
    expect(res.status).toBe(202);
  });

  test("rejects invalid date format", async () => {
    const res = await humanApi("/api/daily/not-a-date");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid date format");
  });

  test("allows today's date", async () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const res = await humanApi(`/api/daily/${todayStr}`);
    expect(res.status).toBe(200);
  });

  test("rejects future date", async () => {
    const res = await humanApi("/api/daily/2099-12-31");
    expect(res.status).toBe(400);
  });

  test("returns stats for a valid past date", async () => {
    const res = await humanApi("/api/daily/2026-02-27");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stats.date).toBe("2026-02-27");
    expect(typeof body.stats.totalSessions).toBe("number");
  });

  test("returns consistent data on repeated requests", async () => {
    const res1 = await humanApi("/api/daily/2026-02-26");
    const res2 = await humanApi("/api/daily/2026-02-26");
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(JSON.stringify((await res1.json()).stats)).toBe(
      JSON.stringify((await res2.json()).stats),
    );
  });

  test("analyze rejects invalid date format", async () => {
    const res = await humanApi("/api/daily/bad/analyze", jsonBody("POST", {}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid date format");
  });

  test("analyze returns 400 when there is nothing to analyze", async () => {
    const res = await humanApi("/api/daily/2020-01-01/analyze", jsonBody("POST", {}));
    expect(res.status).toBe(400);
  });
});
