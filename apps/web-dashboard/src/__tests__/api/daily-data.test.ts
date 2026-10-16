import { describe, expect, test } from "vitest";
import { mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/daily/[date] route handler tests
// ---------------------------------------------------------------------------

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

const cachedAiRow = {
  id: "sum-1",
  user_id: "e2e-test-user",
  date: "2026-02-27",
  ai_score: 80,
  ai_result_json: JSON.stringify({
    score: 80,
    highlights: ["focused"],
    improvements: [],
    timeSegments: [],
    summary: "Good day.",
  }),
  ai_model: "test-model",
  ai_generated_at: "2026-02-28T00:00:00Z",
  ai_prompt: "test-prompt",
  created_at: "2026-02-28T00:00:00Z",
  updated_at: "2026-02-28T00:00:00Z",
};

async function callGET(date: string) {
  const { GET } = await import("../../app/api/daily/[date]/route");
  const req = new Request(`http://localhost/api/daily/${date}`);
  return GET(req, { params: Promise.resolve({ date }) });
}

describe("GET /api/daily/[date]", () => {
  test("returns stats and cached AI result when available", async () => {
    mockD1([
      [tzRow], // getUserTimezone
      [sampleSessionRow], // fetchSessionsForDate
      [cachedAiRow], // dailySummaryRepo.findByUserAndDate
    ]);

    const res = await callGET("2026-02-27");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.timezone).toBe("Asia/Shanghai");
    expect(data.stats).toBeTruthy();
    expect(data.ai).toBeTruthy();
    expect(data.ai.score).toBe(80);
    expect(data.ai.result.highlights).toEqual(["focused"]);
    expect(data.ai.model).toBe("test-model");
    expect(data.ai.prompt).toBe("test-prompt");
  });

  test("returns null AI when no cached analysis", async () => {
    mockD1([
      [tzRow],
      [sampleSessionRow],
      [], // no cached AI
    ]);

    const res = await callGET("2026-02-27");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.ai).toBeNull();
    expect(data.stats).toBeTruthy();
  });

  test("returns 400 for invalid date format", async () => {
    mockD1([[tzRow]]);

    const res = await callGET("not-a-date");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("Invalid date format");
  });

  test("returns 400 for impossible date", async () => {
    mockD1([[tzRow]]);

    const res = await callGET("2026-13-99");
    expect(res.status).toBe(400);
  });

  test("returns 400 for future dates", async () => {
    mockD1([[tzRow]]);

    const res = await callGET("2099-12-31");
    expect(res.status).toBe(400);

    const data = await res.json();
    expect(data.error).toContain("future");
  });
});
