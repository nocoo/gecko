/**
 * GET /api/daily/summaries — date-range summary lookup for the calendar badges.
 *
 * Returns cached AI scores and an analyzed flag per day within a bounded range.
 * Days without any cached row are simply absent from the response.
 */

import { getUserTimezone, jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { dailySummaryRepo } from "@/lib/daily-summary-repo";
import { todayInTz } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 62;

function isValidDateString(dateStr: string): boolean {
  if (!DATE_RE.test(dateStr)) return false;
  const parts = dateStr.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined) return false;
  const test = new Date(Date.UTC(y, m - 1, d));
  return (
    !Number.isNaN(test.getTime()) &&
    test.getUTCFullYear() === y &&
    test.getUTCMonth() === m - 1 &&
    test.getUTCDate() === d
  );
}

function daysBetween(from: string, to: string): number {
  const fromParts = from.split("-").map(Number);
  const toParts = to.split("-").map(Number);
  const fromUtc = Date.UTC(fromParts[0] ?? 0, (fromParts[1] ?? 1) - 1, fromParts[2] ?? 1);
  const toUtc = Date.UTC(toParts[0] ?? 0, (toParts[1] ?? 1) - 1, toParts[2] ?? 1);
  return Math.floor((toUtc - fromUtc) / 86_400_000);
}

export async function GET(req: Request): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? "";
  const to = url.searchParams.get("to") ?? "";

  if (!isValidDateString(from) || !isValidDateString(to)) {
    return jsonError("Invalid date format. Use YYYY-MM-DD for both `from` and `to`.", 400);
  }

  if (from > to) {
    return jsonError("`from` must be on or before `to`.", 400);
  }

  const span = daysBetween(from, to);
  if (span >= MAX_RANGE_DAYS) {
    return jsonError(`Date range too wide (max ${MAX_RANGE_DAYS} days).`, 400);
  }

  // Clamp upper bound to "today in user tz" — we never have data past today.
  const tz = await getUserTimezone(user.userId);
  const today = todayInTz(tz);
  const effectiveTo = to > today ? today : to;
  if (effectiveTo < from) {
    return jsonOk({ summaries: [] });
  }

  const rows = await dailySummaryRepo.listByUserAndDateRange(user.userId, from, effectiveTo);

  const summaries = rows.map((r) => ({
    date: r.date,
    score: r.ai_score,
    hasAi: r.has_ai_result === 1,
  }));

  return jsonOk({ summaries });
}
