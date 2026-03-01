import { describe, test, expect } from "bun:test";
import {
  getDateBoundsEpoch,
  localDateToUTCEpoch,
  getTimezoneOffsetMinutes,
  epochToLocalHHMM,
  epochToLocalHHMMSS,
  epochToDateStr,
  todayInTz,
  yesterdayInTz,
  sqlDateExpr,
  isValidTimezone,
  DEFAULT_TIMEZONE,
  COMMON_TIMEZONES,
} from "../../lib/timezone";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("DEFAULT_TIMEZONE", () => {
  test("is Asia/Shanghai", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Shanghai");
  });
});

describe("COMMON_TIMEZONES", () => {
  test("contains at least 10 entries", () => {
    expect(COMMON_TIMEZONES.length).toBeGreaterThanOrEqual(10);
  });

  test("all entries are valid IANA timezones", () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(isValidTimezone(tz.value)).toBe(true);
    }
  });

  test("each entry has value and label", () => {
    for (const tz of COMMON_TIMEZONES) {
      expect(tz.value).toBeTruthy();
      expect(tz.label).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// getTimezoneOffsetMinutes
// ---------------------------------------------------------------------------

describe("getTimezoneOffsetMinutes", () => {
  test("Asia/Shanghai is always +480 (no DST)", () => {
    // Summer
    expect(getTimezoneOffsetMinutes(2026, 7, 15, "Asia/Shanghai")).toBe(480);
    // Winter
    expect(getTimezoneOffsetMinutes(2026, 1, 15, "Asia/Shanghai")).toBe(480);
  });

  test("UTC is always 0", () => {
    expect(getTimezoneOffsetMinutes(2026, 3, 1, "UTC")).toBe(0);
    expect(getTimezoneOffsetMinutes(2026, 7, 1, "UTC")).toBe(0);
  });

  test("America/New_York has DST transitions", () => {
    // Winter (EST = UTC-5 = -300)
    expect(getTimezoneOffsetMinutes(2026, 1, 15, "America/New_York")).toBe(-300);
    // Summer (EDT = UTC-4 = -240)
    expect(getTimezoneOffsetMinutes(2026, 7, 15, "America/New_York")).toBe(-240);
  });

  test("Asia/Kolkata is +330 (half-hour offset)", () => {
    expect(getTimezoneOffsetMinutes(2026, 3, 1, "Asia/Kolkata")).toBe(330);
  });
});

// ---------------------------------------------------------------------------
// localDateToUTCEpoch
// ---------------------------------------------------------------------------

describe("localDateToUTCEpoch", () => {
  test("Asia/Shanghai midnight = UTC 16:00 previous day", () => {
    // 2026-03-01T00:00:00+08:00 = 2026-02-28T16:00:00Z
    const epoch = localDateToUTCEpoch("2026-03-01", "Asia/Shanghai");
    const expected = Date.UTC(2026, 1, 28, 16, 0, 0) / 1000;
    expect(epoch).toBe(expected);
  });

  test("UTC midnight = 00:00:00Z", () => {
    const epoch = localDateToUTCEpoch("2026-03-01", "UTC");
    const expected = Date.UTC(2026, 2, 1, 0, 0, 0) / 1000;
    expect(epoch).toBe(expected);
  });

  test("America/New_York winter midnight = UTC 05:00", () => {
    // 2026-01-15T00:00:00-05:00 = 2026-01-15T05:00:00Z
    const epoch = localDateToUTCEpoch("2026-01-15", "America/New_York");
    const expected = Date.UTC(2026, 0, 15, 5, 0, 0) / 1000;
    expect(epoch).toBe(expected);
  });

  test("America/New_York summer midnight = UTC 04:00", () => {
    // 2026-07-15T00:00:00-04:00 = 2026-07-15T04:00:00Z
    const epoch = localDateToUTCEpoch("2026-07-15", "America/New_York");
    const expected = Date.UTC(2026, 6, 15, 4, 0, 0) / 1000;
    expect(epoch).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// getDateBoundsEpoch
// ---------------------------------------------------------------------------

describe("getDateBoundsEpoch", () => {
  test("returns 24h range for Asia/Shanghai", () => {
    const { start, end } = getDateBoundsEpoch("2026-03-01", "Asia/Shanghai");
    expect(end - start).toBe(86400);
  });

  test("start is midnight local, end is next midnight", () => {
    const { start, end } = getDateBoundsEpoch("2026-03-01", "Asia/Shanghai");
    // start = 2026-03-01T00:00:00+08:00 = 2026-02-28T16:00:00Z
    const expectedStart = Date.UTC(2026, 1, 28, 16, 0, 0) / 1000;
    expect(start).toBe(expectedStart);
    // end = 2026-03-02T00:00:00+08:00 = 2026-03-01T16:00:00Z
    const expectedEnd = Date.UTC(2026, 2, 1, 16, 0, 0) / 1000;
    expect(end).toBe(expectedEnd);
  });

  test("UTC bounds equal the date itself", () => {
    const { start, end } = getDateBoundsEpoch("2026-03-01", "UTC");
    expect(start).toBe(Date.UTC(2026, 2, 1) / 1000);
    expect(end).toBe(Date.UTC(2026, 2, 2) / 1000);
  });
});

// ---------------------------------------------------------------------------
// epochToLocalHHMM / epochToLocalHHMMSS
// ---------------------------------------------------------------------------

describe("epochToLocalHHMM", () => {
  test("formats epoch in Asia/Shanghai timezone", () => {
    // 2026-03-01T16:00:00Z = 2026-03-02T00:00:00+08:00
    const epoch = Date.UTC(2026, 2, 1, 16, 0, 0) / 1000;
    expect(epochToLocalHHMM(epoch, "Asia/Shanghai")).toBe("00:00");
  });

  test("formats epoch in UTC", () => {
    const epoch = Date.UTC(2026, 2, 1, 14, 30, 0) / 1000;
    expect(epochToLocalHHMM(epoch, "UTC")).toBe("14:30");
  });

  test("formats epoch in America/New_York (winter)", () => {
    // 2026-01-15T20:45:00Z = 2026-01-15T15:45:00-05:00
    const epoch = Date.UTC(2026, 0, 15, 20, 45, 0) / 1000;
    expect(epochToLocalHHMM(epoch, "America/New_York")).toBe("15:45");
  });
});

describe("epochToLocalHHMMSS", () => {
  test("includes seconds", () => {
    const epoch = Date.UTC(2026, 2, 1, 14, 30, 45) / 1000;
    expect(epochToLocalHHMMSS(epoch, "UTC")).toBe("14:30:45");
  });
});

// ---------------------------------------------------------------------------
// epochToDateStr
// ---------------------------------------------------------------------------

describe("epochToDateStr", () => {
  test("converts UTC epoch to date in Asia/Shanghai", () => {
    // 2026-02-28T17:00:00Z = 2026-03-01T01:00:00+08:00 → date is 2026-03-01
    const epoch = Date.UTC(2026, 1, 28, 17, 0, 0) / 1000;
    expect(epochToDateStr(epoch, "Asia/Shanghai")).toBe("2026-03-01");
  });

  test("converts UTC epoch to date in UTC", () => {
    const epoch = Date.UTC(2026, 1, 28, 17, 0, 0) / 1000;
    expect(epochToDateStr(epoch, "UTC")).toBe("2026-02-28");
  });

  test("handles date boundary correctly", () => {
    // Just before midnight UTC+8: 2026-02-28T15:59:59Z = 2026-02-28T23:59:59+08
    const beforeMidnight = Date.UTC(2026, 1, 28, 15, 59, 59) / 1000;
    expect(epochToDateStr(beforeMidnight, "Asia/Shanghai")).toBe("2026-02-28");

    // Just after midnight UTC+8: 2026-02-28T16:00:01Z = 2026-03-01T00:00:01+08
    const afterMidnight = Date.UTC(2026, 1, 28, 16, 0, 1) / 1000;
    expect(epochToDateStr(afterMidnight, "Asia/Shanghai")).toBe("2026-03-01");
  });
});

// ---------------------------------------------------------------------------
// todayInTz / yesterdayInTz
// ---------------------------------------------------------------------------

describe("todayInTz", () => {
  test("returns YYYY-MM-DD format", () => {
    const result = todayInTz("Asia/Shanghai");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("matches epochToDateStr for current time", () => {
    const nowEpoch = Date.now() / 1000;
    expect(todayInTz("Asia/Shanghai")).toBe(epochToDateStr(nowEpoch, "Asia/Shanghai"));
  });
});

describe("yesterdayInTz", () => {
  test("returns YYYY-MM-DD format", () => {
    const result = yesterdayInTz("Asia/Shanghai");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("is exactly 1 day before today", () => {
    const today = todayInTz("UTC");
    const yesterday = yesterdayInTz("UTC");
    const todayDate = new Date(today + "T00:00:00Z");
    const yesterdayDate = new Date(yesterday + "T00:00:00Z");
    const diffMs = todayDate.getTime() - yesterdayDate.getTime();
    expect(diffMs).toBe(86400 * 1000);
  });
});

// ---------------------------------------------------------------------------
// sqlDateExpr
// ---------------------------------------------------------------------------

describe("sqlDateExpr", () => {
  test("returns offset-adjusted SQL expression for Asia/Shanghai", () => {
    const { expr, offsetSec } = sqlDateExpr("Asia/Shanghai");
    expect(offsetSec).toBe(28800); // +8h = 28800s
    expect(expr).toBe("date(start_time + 28800, 'unixepoch')");
  });

  test("returns zero offset for UTC", () => {
    const { expr, offsetSec } = sqlDateExpr("UTC");
    expect(offsetSec).toBe(0);
    expect(expr).toBe("date(start_time + 0, 'unixepoch')");
  });

  test("returns negative offset for America/New_York", () => {
    const { offsetSec } = sqlDateExpr("America/New_York");
    // -5h or -4h depending on DST
    expect(offsetSec === -18000 || offsetSec === -14400).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isValidTimezone
// ---------------------------------------------------------------------------

describe("isValidTimezone", () => {
  test("accepts valid IANA timezones", () => {
    expect(isValidTimezone("Asia/Shanghai")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Europe/London")).toBe(true);
  });

  test("rejects invalid timezone strings", () => {
    expect(isValidTimezone("Invalid/Zone")).toBe(false);
    expect(isValidTimezone("")).toBe(false);
    // Note: "+08:00" is accepted by Intl.DateTimeFormat in some runtimes
    // as a valid UTC offset identifier, so we don't test it as invalid.
    expect(isValidTimezone("Not_A_Zone")).toBe(false);
  });
});
