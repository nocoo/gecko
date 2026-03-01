/**
 * Timezone utilities for Gecko.
 *
 * All timestamps in the database are stored as UTC epoch seconds.
 * This module converts between UTC epochs and user-local dates/times
 * using IANA timezone names (e.g. "Asia/Shanghai").
 *
 * Default timezone: Asia/Shanghai (UTC+8).
 */

export const DEFAULT_TIMEZONE = "Asia/Shanghai";

// ---------------------------------------------------------------------------
// Core: date boundary calculation
// ---------------------------------------------------------------------------

/**
 * Return the UTC epoch-second range [start, end) for a given local date
 * in the specified timezone.
 *
 * Example: getDateBoundsEpoch("2026-03-01", "Asia/Shanghai")
 *   → start = 2026-03-01T00:00:00+08:00 as epoch seconds
 *   → end   = 2026-03-02T00:00:00+08:00 as epoch seconds
 *
 * On DST transition days the interval may be 23h or 25h — this is correct.
 */
export function getDateBoundsEpoch(
  dateStr: string,
  tz: string,
): { start: number; end: number } {
  const start = localDateToUTCEpoch(dateStr, tz);

  // Compute next day's date string, then get its midnight epoch
  const [y, m, d] = dateStr.split("-").map(Number);
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
  const nextDateStr = formatDateParts(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
  );
  const end = localDateToUTCEpoch(nextDateStr, tz);

  return { start, end };
}

/**
 * Convert a local date string (YYYY-MM-DD) to a UTC epoch (seconds)
 * representing midnight in the given timezone.
 *
 * Uses a two-pass approach to handle DST correctly:
 *  1. Get the offset at the target date's midnight-hour (hour=0) using
 *     a nearby UTC reference point.
 *  2. Compute midnight epoch from that offset.
 *  3. Verify by re-probing the offset at the resulting epoch. If DST
 *     causes a different offset, correct with the second value.
 *
 * This handles spring-forward (midnight may not exist → use the new offset)
 * and fall-back (midnight is ambiguous → use the *first* occurrence, i.e.
 * the offset *before* clocks change).
 */
export function localDateToUTCEpoch(dateStr: string, tz: string): number {
  // Parse date parts
  const [year, month, day] = dateStr.split("-").map(Number);

  // First estimate: probe offset using noon on the same date (safe from DST gaps)
  const noonOffset = getTimezoneOffsetMinutes(year, month, day, tz, 12);

  // Compute approximate midnight UTC using noon's offset
  const midnightUTC = Date.UTC(year, month - 1, day) / 1000;
  const approxMidnight = midnightUTC - noonOffset * 60;

  // Second pass: probe offset at the approximate midnight instant.
  // Format the approxMidnight instant in the target tz and extract real offset.
  const realOffset = offsetAtEpoch(approxMidnight, tz);

  // If the offset changed (DST transition between noon and midnight),
  // recompute with the real midnight offset.
  return midnightUTC - realOffset * 60;
}

/**
 * Get the UTC offset (in minutes, positive = east) at a specific UTC epoch.
 * Uses Intl.DateTimeFormat to discover the local time, then computes offset.
 */
function offsetAtEpoch(epochSec: number, tz: string): number {
  const ms = epochSec * 1000;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  const lY = get("year"), lM = get("month"), lD = get("day");
  let lH = get("hour");
  if (lH === 24) lH = 0;
  const lMin = get("minute");
  const lS = get("second");

  const localAsUTC = Date.UTC(lY, lM - 1, lD, lH, lMin, lS);
  return (localAsUTC - ms) / 60_000;
}

/**
 * Get the UTC offset in minutes for a specific date+hour in a timezone.
 * Positive = east of UTC (e.g. +480 for Asia/Shanghai).
 *
 * @param hour - The local hour to probe (default 12 = noon). Use 0 to get
 *   the offset at midnight, which may differ from noon on DST transition days.
 *
 * Implementation: we construct a UTC timestamp at the given hour on this date,
 * then use Intl.DateTimeFormat to discover what local time that UTC instant
 * maps to, and compute the offset from the difference.
 *
 * NOTE: When hour=0, the UTC instant we probe is `Date.UTC(y, m-1, d, 0)`.
 * For timezones east of UTC (e.g. Asia/Shanghai +8), that UTC instant is
 * already 08:00 local — well past any DST gap. For timezones west of UTC
 * (e.g. America/New_York -5), that UTC instant is 19:00 *previous* local day.
 * In both cases the Intl formatter returns the correct local time, and the
 * offset formula `(localAsUTC - utcRef) / 60_000` gives the right answer
 * because it's purely arithmetic: it doesn't care *which* local date/time
 * Intl returns, only the difference.
 */
export function getTimezoneOffsetMinutes(
  year: number,
  month: number,
  day: number,
  tz: string,
  hour = 12,
): number {
  const utcRef = Date.UTC(year, month - 1, day, hour, 0, 0);

  // Format in the target timezone to get local date/time parts
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = fmt.formatToParts(new Date(utcRef));
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)!.value, 10);

  const localYear = get("year");
  const localMonth = get("month");
  const localDay = get("day");
  let localHour = get("hour");
  // Intl may return hour 24 for midnight — normalize to 0
  if (localHour === 24) localHour = 0;
  const localMinute = get("minute");

  // Reconstruct what UTC timestamp this local time represents
  const localAsUTC =
    Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0);

  // Offset = local - UTC (in minutes)
  return (localAsUTC - utcRef) / 60_000;
}

// ---------------------------------------------------------------------------
// Epoch → local time formatting
// ---------------------------------------------------------------------------

/**
 * Convert a UTC epoch (seconds) to "HH:MM" in the given timezone.
 * Server-safe: does not depend on the server's local timezone.
 */
export function epochToLocalHHMM(epoch: number, tz: string): string {
  const date = new Date(epoch * 1000);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return fmt.format(date);
}

/**
 * Convert a UTC epoch (seconds) to "HH:MM:SS" in the given timezone.
 */
export function epochToLocalHHMMSS(epoch: number, tz: string): string {
  const date = new Date(epoch * 1000);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return fmt.format(date);
}

// ---------------------------------------------------------------------------
// "Today" / "Yesterday" in a timezone
// ---------------------------------------------------------------------------

/**
 * Return today's date string (YYYY-MM-DD) in the given timezone.
 */
export function todayInTz(tz: string): string {
  return epochToDateStr(Date.now() / 1000, tz);
}

/**
 * Return yesterday's date string (YYYY-MM-DD) in the given timezone.
 */
export function yesterdayInTz(tz: string): string {
  // Get today in tz, then subtract 1 day
  const today = todayInTz(tz);
  const [y, m, d] = today.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return formatDateParts(
    prev.getUTCFullYear(),
    prev.getUTCMonth() + 1,
    prev.getUTCDate(),
  );
}

/**
 * Convert a UTC epoch (seconds) to a date string (YYYY-MM-DD) in the given tz.
 */
export function epochToDateStr(epoch: number, tz: string): string {
  const date = new Date(epoch * 1000);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    // en-CA produces YYYY-MM-DD format
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(date);
}

// ---------------------------------------------------------------------------
// SQL helper for timezone-aware date grouping
// ---------------------------------------------------------------------------

/**
 * For SQLite GROUP BY with timezone offset.
 *
 * SQLite's `date(epoch, 'unixepoch')` returns UTC date.
 * To group by local date, we add the timezone offset in seconds:
 *   `date(start_time + <offsetSec>, 'unixepoch')`
 *
 * NOTE: This uses a fixed offset which doesn't handle DST transitions
 * within a query range. For most use cases (charts spanning days/weeks),
 * the error is at most 1 hour at the DST boundary, which is acceptable.
 * For the daily review (single-day queries), we use getDateBoundsEpoch()
 * which handles DST correctly.
 */
export function sqlDateExpr(tz: string): { expr: string; offsetSec: number } {
  const now = new Date();
  const offset = getTimezoneOffsetMinutes(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    tz,
  );
  const offsetSec = offset * 60;
  return {
    expr: `date(start_time + ${offsetSec}, 'unixepoch')`,
    offsetSec,
  };
}

// ---------------------------------------------------------------------------
// Timezone validation & listing
// ---------------------------------------------------------------------------

/** Common IANA timezones for the settings UI. */
export const COMMON_TIMEZONES: { value: string; label: string }[] = [
  { value: "Asia/Shanghai", label: "China Standard Time (UTC+8)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (UTC+9)" },
  { value: "Asia/Seoul", label: "Korea Standard Time (UTC+9)" },
  { value: "Asia/Taipei", label: "Taipei Standard Time (UTC+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time (UTC+8)" },
  { value: "Asia/Singapore", label: "Singapore Time (UTC+8)" },
  { value: "Asia/Kolkata", label: "India Standard Time (UTC+5:30)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (UTC+4)" },
  { value: "Europe/London", label: "Greenwich Mean Time (UTC+0/+1)" },
  { value: "Europe/Paris", label: "Central European Time (UTC+1/+2)" },
  { value: "Europe/Berlin", label: "Central European Time (UTC+1/+2)" },
  { value: "Europe/Moscow", label: "Moscow Standard Time (UTC+3)" },
  { value: "America/New_York", label: "Eastern Time (UTC-5/-4)" },
  { value: "America/Chicago", label: "Central Time (UTC-6/-5)" },
  { value: "America/Denver", label: "Mountain Time (UTC-7/-6)" },
  { value: "America/Los_Angeles", label: "Pacific Time (UTC-8/-7)" },
  { value: "America/Anchorage", label: "Alaska Time (UTC-9/-8)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (UTC-10)" },
  { value: "Pacific/Auckland", label: "New Zealand Time (UTC+12/+13)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (UTC+10/+11)" },
];

/**
 * Check if a string is a valid IANA timezone.
 * Uses Intl.DateTimeFormat to validate.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function formatDateParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
