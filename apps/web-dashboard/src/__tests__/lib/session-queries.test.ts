/**
 * Tests for lib/session-queries.ts — fetchSessionsForDate.
 *
 * Verifies:
 * 1. The SQL includes cross-midnight sessions via OR clause
 * 2. Sessions are clipped to [dayStart, dayEnd) boundaries
 * 3. Zero-duration sessions after clipping are filtered out
 */

import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.CF_ACCOUNT_ID = "test-account-id";
  process.env.CF_API_TOKEN = "test-api-token";
  process.env.CF_D1_DATABASE_ID = "test-db-id";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// D1 mock helper
// ---------------------------------------------------------------------------

interface D1Call {
  sql: string;
  params: unknown[];
}

function mockD1(results: unknown[][]) {
  let callIndex = 0;
  const calls: D1Call[] = [];

  globalThis.fetch = mock((_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ sql: body.sql as string, params: body.params as unknown[] });

    const rows = results[callIndex] ?? [];
    callIndex++;

    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          result: [{ results: rows, success: true, meta: { changes: 0, last_row_id: 0 } }],
          errors: [],
        }),
        { status: 200 },
      ),
    );
  }) as unknown as typeof fetch;

  return { calls };
}

// ---------------------------------------------------------------------------
// Constants for Asia/Shanghai (UTC+8, no DST)
// ---------------------------------------------------------------------------

// 2026-02-28 00:00 CST = 2026-02-27 16:00 UTC
const DAY_START = 1772208000;
// 2026-03-01 00:00 CST = 2026-02-28 16:00 UTC
const DAY_END = 1772294400;

const TZ = "Asia/Shanghai";
const DATE = "2026-02-28";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("fetchSessionsForDate", () => {
  test("SQL includes cross-midnight OR clause", async () => {
    const { calls } = mockD1([[]]);

    const { fetchSessionsForDate } = await import("../../lib/session-queries");
    await fetchSessionsForDate("user-1", DATE, TZ);

    expect(calls).toHaveLength(1);
    const sql = calls[0].sql;

    // Must have both the normal range clause and the cross-midnight clause
    expect(sql).toContain("start_time >= ?");
    expect(sql).toContain("start_time < ?");
    expect(sql).toContain("start_time + duration > ?");

    // Verify the params: [userId, dayStart, dayEnd, dayStart, dayStart]
    expect(calls[0].params).toEqual(["user-1", DAY_START, DAY_END, DAY_START, DAY_START]);
  });

  test("returns normal sessions without clipping", async () => {
    // Session fully within the day: 08:00-09:00 CST
    const session = {
      id: "s1",
      app_name: "VSCode",
      bundle_id: "com.microsoft.VSCode",
      window_title: "main.ts",
      url: null,
      start_time: DAY_START + 8 * 3600, // 08:00 CST
      duration: 3600, // 1 hour
    };

    mockD1([[session]]);

    const { fetchSessionsForDate } = await import("../../lib/session-queries");
    const rows = await fetchSessionsForDate("user-1", DATE, TZ);

    expect(rows).toHaveLength(1);
    // Should be unchanged — no clipping needed
    expect(rows[0].start_time).toBe(session.start_time);
    expect(rows[0].duration).toBe(session.duration);
  });

  test("clips cross-midnight session to day start", async () => {
    // Session that started at 21:24 on 2026-02-27 and ends at 05:26 on 2026-02-28
    // In UTC: start = 2026-02-27 13:24 UTC, end = 2026-02-27 21:26 UTC
    const prevDayStart = DAY_START - 2 * 3600 - 36 * 60; // 21:24 CST = 2h36m before midnight
    const totalDuration = 8 * 3600 + 2 * 60; // 8h2m (21:24 → 05:26)

    const crossMidnightSession = {
      id: "s-cross",
      app_name: "loginwindow",
      bundle_id: "com.apple.loginwindow",
      window_title: "",
      url: null,
      start_time: prevDayStart,
      duration: totalDuration,
    };

    mockD1([[crossMidnightSession]]);

    const { fetchSessionsForDate } = await import("../../lib/session-queries");
    const rows = await fetchSessionsForDate("user-1", DATE, TZ);

    expect(rows).toHaveLength(1);
    // Should be clipped: start moved to dayStart, duration shortened
    expect(rows[0].start_time).toBe(DAY_START); // clipped to 00:00 CST
    // Original end = prevDayStart + totalDuration
    const origEnd = prevDayStart + totalDuration;
    const expectedDuration = origEnd - DAY_START; // portion within the day
    expect(rows[0].duration).toBe(expectedDuration);
    // Sanity: ~5h26m = 19560s
    expect(rows[0].duration).toBeCloseTo(5 * 3600 + 26 * 60, 0);
  });

  test("clips session extending past day end", async () => {
    // Session starting at 23:00 CST and lasting 3 hours (past midnight)
    const lateStart = DAY_END - 3600; // 23:00 CST
    const session = {
      id: "s-late",
      app_name: "Firefox",
      bundle_id: "org.mozilla.firefox",
      window_title: "YouTube",
      url: "https://youtube.com",
      start_time: lateStart,
      duration: 3 * 3600, // 3 hours → ends 02:00 CST next day
    };

    mockD1([[session]]);

    const { fetchSessionsForDate } = await import("../../lib/session-queries");
    const rows = await fetchSessionsForDate("user-1", DATE, TZ);

    expect(rows).toHaveLength(1);
    // Should be clipped at dayEnd
    expect(rows[0].start_time).toBe(lateStart); // start unchanged
    expect(rows[0].duration).toBe(3600); // only 1h within the day (23:00-24:00)
  });

  test("clips both start and end for session spanning entire day", async () => {
    // Extreme case: session started yesterday and ends tomorrow
    const session = {
      id: "s-spanning",
      app_name: "loginwindow",
      bundle_id: "com.apple.loginwindow",
      window_title: "",
      url: null,
      start_time: DAY_START - 12 * 3600, // 12:00 CST previous day
      duration: 48 * 3600, // 48 hours
    };

    mockD1([[session]]);

    const { fetchSessionsForDate } = await import("../../lib/session-queries");
    const rows = await fetchSessionsForDate("user-1", DATE, TZ);

    expect(rows).toHaveLength(1);
    expect(rows[0].start_time).toBe(DAY_START);
    expect(rows[0].duration).toBe(DAY_END - DAY_START); // exactly 24h
  });

  test("filters out zero-duration sessions after clipping", async () => {
    // Session that ends exactly at dayStart — after clipping, duration = 0
    const session = {
      id: "s-zero",
      app_name: "VSCode",
      bundle_id: "com.microsoft.VSCode",
      window_title: "",
      url: null,
      start_time: DAY_START - 3600, // 1h before day start
      duration: 3600, // ends exactly at dayStart
    };

    mockD1([[session]]);

    const { fetchSessionsForDate } = await import("../../lib/session-queries");
    const rows = await fetchSessionsForDate("user-1", DATE, TZ);

    // The SQL `start_time + duration > dayStart` should not match this session
    // (3600 + duration = dayStart, not > dayStart), but even if it did, the
    // clipping logic would produce duration = 0 and filter it out.
    expect(rows).toHaveLength(0);
  });

  test("mixed: normal + cross-midnight sessions in same result", async () => {
    // Cross-midnight session: loginwindow 21:24 → 05:26
    const crossSession = {
      id: "s-cross",
      app_name: "loginwindow",
      bundle_id: "com.apple.loginwindow",
      window_title: "",
      url: null,
      start_time: DAY_START - 2 * 3600 - 36 * 60,
      duration: 8 * 3600 + 2 * 60,
    };

    // Normal session: VSCode 06:00-07:00
    const normalSession = {
      id: "s-normal",
      app_name: "VSCode",
      bundle_id: "com.microsoft.VSCode",
      window_title: "app.ts",
      url: null,
      start_time: DAY_START + 6 * 3600,
      duration: 3600,
    };

    mockD1([[crossSession, normalSession]]);

    const { fetchSessionsForDate } = await import("../../lib/session-queries");
    const rows = await fetchSessionsForDate("user-1", DATE, TZ);

    expect(rows).toHaveLength(2);

    // First session: clipped cross-midnight
    expect(rows[0].id).toBe("s-cross");
    expect(rows[0].start_time).toBe(DAY_START);

    // Second session: unchanged
    expect(rows[1].id).toBe("s-normal");
    expect(rows[1].start_time).toBe(normalSession.start_time);
    expect(rows[1].duration).toBe(normalSession.duration);
  });

  test("preserves all fields when clipping (id, app_name, bundle_id, etc.)", async () => {
    const crossSession = {
      id: "s-preserve",
      app_name: "loginwindow",
      bundle_id: "com.apple.loginwindow",
      window_title: "Login Window",
      url: null,
      start_time: DAY_START - 7200,
      duration: 10800, // 3h → 2h before midnight + 1h after midnight
    };

    mockD1([[crossSession]]);

    const { fetchSessionsForDate } = await import("../../lib/session-queries");
    const rows = await fetchSessionsForDate("user-1", DATE, TZ);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("s-preserve");
    expect(rows[0].app_name).toBe("loginwindow");
    expect(rows[0].bundle_id).toBe("com.apple.loginwindow");
    expect(rows[0].window_title).toBe("Login Window");
    expect(rows[0].url).toBeNull();
    // Clipped values
    expect(rows[0].start_time).toBe(DAY_START);
    expect(rows[0].duration).toBe(3600); // 1h within the day
  });
});
