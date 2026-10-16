import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// /api/daily/[date]/preview-prompt route handler tests
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

async function callPOST(date: string) {
  const { POST } = await import("../../app/api/daily/[date]/preview-prompt/route");
  const req = humanRequest(`/api/daily/${date}/preview-prompt`, { method: "POST" });
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
