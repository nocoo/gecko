import { describe, expect, test } from "vitest";
import { humanRequest, mockD1 } from "../test-env";

// ---------------------------------------------------------------------------
// GET /api/stats/timeline — daily aggregated screen time
// ---------------------------------------------------------------------------

/** Mock timezone setting lookup (first call) then actual query data. */
function mockD1WithTz(dataResponses: unknown[][] = [[]], tz = "Asia/Shanghai") {
  // First call is getUserTimezone → settingsRepo.findByKey
  const tzRow = [{ user_id: "e2e-test-user", key: "timezone", value: tz, updated_at: Date.now() }];
  return mockD1([tzRow, ...dataResponses]);
}

describe("GET /api/stats/timeline", () => {
  test("returns daily aggregated data", async () => {
    mockD1WithTz([
      [
        { date: "2026-02-25", total_duration: 7200, session_count: 15, app_count: 5 },
        { date: "2026-02-26", total_duration: 5400, session_count: 10, app_count: 4 },
        { date: "2026-02-27", total_duration: 3600, session_count: 8, app_count: 3 },
      ],
    ]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = humanRequest("http://127.0.0.1:17018/api/stats/timeline?period=week");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.period).toBe("week");
    expect(data.timezone).toBe("Asia/Shanghai");
    expect(data.timeline).toHaveLength(3);
    expect(data.timeline[0]).toEqual({
      date: "2026-02-25",
      totalDuration: 7200,
      sessionCount: 15,
      appCount: 5,
    });
  });

  test("defaults to 'week' period", async () => {
    const { calls } = mockD1WithTz([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = humanRequest("http://127.0.0.1:17018/api/stats/timeline");
    const res = await GET(req);
    const data = await res.json();

    expect(data.period).toBe("week");
    // calls[0] = timezone lookup, calls[1] = data query
    // Data query should have user_id + start_time
    const c1 = calls[1];
    if (!c1) return;
    expect(c1.params.length).toBe(2);
  });

  test("handles 'all' period without start_time filter", async () => {
    const { calls } = mockD1WithTz([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = humanRequest("http://127.0.0.1:17018/api/stats/timeline?period=all");
    const res = await GET(req);
    const data = await res.json();

    expect(data.period).toBe("all");
    // calls[0] = timezone lookup, calls[1] = data query
    // Only user_id, no start_time
    const c1 = calls[1];
    if (!c1) return;
    expect(c1.params.length).toBe(1);
  });

  test("handles 'month' period", async () => {
    const { calls } = mockD1WithTz([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = humanRequest("http://127.0.0.1:17018/api/stats/timeline?period=month");
    const res = await GET(req);
    const data = await res.json();

    expect(data.period).toBe("month");
    const c1 = calls[1];
    if (!c1) return;
    expect(c1.params.length).toBe(2);
  });

  test("returns empty timeline when no data", async () => {
    mockD1WithTz([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = humanRequest("http://127.0.0.1:17018/api/stats/timeline?period=week");
    const res = await GET(req);
    const data = await res.json();

    expect(data.timeline).toEqual([]);
  });

  test("SQL groups by timezone-adjusted date and orders ASC", async () => {
    const { calls } = mockD1WithTz([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = humanRequest("http://127.0.0.1:17018/api/stats/timeline?period=week");
    await GET(req);

    // calls[1] = data query (after timezone lookup)
    const c1 = calls[1];
    if (!c1) return;
    const sql = c1.sql;
    // Should contain timezone-offset date expression: date(start_time + <offset>, 'unixepoch')
    expect(sql).toContain("date(start_time +");
    expect(sql).toContain("'unixepoch')");
    expect(sql).toContain("ORDER BY date ASC");
  });

  test("falls back to 'week' for invalid period", async () => {
    mockD1WithTz([[]]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = humanRequest("http://127.0.0.1:17018/api/stats/timeline?period=invalid");
    const res = await GET(req);
    const data = await res.json();

    expect(data.period).toBe("week");
  });

  test("uses default timezone when no setting stored", async () => {
    // First call (timezone lookup) returns empty result
    const { calls: _calls } = mockD1([[], []]);
    const { GET } = await import("../../app/api/stats/timeline/route");

    const req = humanRequest("http://127.0.0.1:17018/api/stats/timeline?period=week");
    const res = await GET(req);
    const data = await res.json();

    expect(data.timezone).toBe("Asia/Shanghai");
  });
});
