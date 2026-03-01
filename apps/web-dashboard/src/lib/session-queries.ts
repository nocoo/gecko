/**
 * Shared session query helpers.
 *
 * Used by /api/daily/[date] (stats) and /api/daily/[date]/analyze (AI) routes.
 */

import { query } from "@/lib/d1";
import { getDateBoundsEpoch } from "@/lib/timezone";
import type { SessionRow } from "@/services/daily-stats";

/**
 * Fetch sessions for a specific date from D1, using the user's timezone for day boundaries.
 *
 * Includes two kinds of sessions:
 * 1. Sessions that START within the day: `start_time >= dayStart AND start_time < dayEnd`
 * 2. Cross-midnight sessions that started before the day but extend into it:
 *    `start_time < dayStart AND start_time + duration > dayStart`
 *
 * Cross-midnight sessions are clipped: their start_time is moved to dayStart
 * and duration is shortened to only the portion within [dayStart, dayEnd).
 * Sessions extending past dayEnd are similarly clipped on the right.
 */
export async function fetchSessionsForDate(
  userId: string,
  date: string,
  tz: string,
): Promise<SessionRow[]> {
  const { start: dayStart, end: dayEnd } = getDateBoundsEpoch(date, tz);

  const rows = await query<SessionRow>(
    `SELECT id, app_name, bundle_id, window_title, url, start_time, duration
     FROM focus_sessions
     WHERE user_id = ?
       AND (
         (start_time >= ? AND start_time < ?)
         OR
         (start_time < ? AND start_time + duration > ?)
       )
     ORDER BY start_time ASC`,
    [userId, dayStart, dayEnd, dayStart, dayStart],
  );

  // Clip sessions to [dayStart, dayEnd) boundaries
  return rows
    .map((row) => {
      const origStart = row.start_time;
      const origEnd = origStart + row.duration;
      const clippedStart = Math.max(origStart, dayStart);
      const clippedEnd = Math.min(origEnd, dayEnd);
      const clippedDuration = Math.max(0, clippedEnd - clippedStart);

      if (clippedStart === origStart && clippedDuration === row.duration) {
        return row; // no clipping needed
      }
      return { ...row, start_time: clippedStart, duration: clippedDuration };
    })
    .filter((row) => row.duration > 0);
}
