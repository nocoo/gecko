/**
 * POST /api/daily/[date]/preview-prompt — Build and return the AI prompt
 * without calling the AI provider.
 *
 * This is a lightweight endpoint that returns instantly. The frontend calls
 * this in parallel with /analyze so the user can see the prompt while the
 * AI is still thinking.
 */

import { getUserTimezone, jsonError, jsonOk, requireSession } from "@/lib/api-helpers";
import { fetchSessionsForDate } from "@/lib/session-queries";
import { todayInTz } from "@/lib/timezone";
import {
  buildPrompt,
  type CustomPromptSections,
  loadAiSettings,
  loadAppContext,
} from "@/services/analyze-core";
import { computeDailyStats } from "@/services/daily-stats";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateDate(dateStr: string, tz: string): string | null {
  if (!DATE_RE.test(dateStr)) {
    return "Invalid date format. Use YYYY-MM-DD.";
  }
  const parts = dateStr.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (y === undefined || m === undefined || d === undefined) {
    return "Invalid date.";
  }
  const test = new Date(Date.UTC(y, m - 1, d));
  if (
    Number.isNaN(test.getTime()) ||
    test.getUTCFullYear() !== y ||
    test.getUTCMonth() !== m - 1 ||
    test.getUTCDate() !== d
  ) {
    return "Invalid date.";
  }
  const today = todayInTz(tz);
  if (dateStr > today) {
    return "Cannot analyze future dates.";
  }
  return null;
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ date: string }> },
): Promise<Response> {
  const { user, error } = await requireSession();
  if (error) return error;

  const tz = await getUserTimezone(user.userId);

  const { date } = await params;
  const validationError = validateDate(date, tz);
  if (validationError) {
    return jsonError(validationError, 400);
  }

  // Load settings (for custom prompt sections) and sessions in parallel
  const [settings, rows] = await Promise.all([
    loadAiSettings(user.userId),
    fetchSessionsForDate(user.userId, date, tz),
  ]);

  if (rows.length === 0) {
    return jsonError("No sessions found for this date.", 400);
  }

  const stats = computeDailyStats(date, rows);
  const appContext = await loadAppContext(user.userId);

  const customSections: CustomPromptSections = {};
  if (settings.promptSection1) customSections.section1 = settings.promptSection1;
  if (settings.promptSection2) customSections.section2 = settings.promptSection2;
  if (settings.promptSection3) customSections.section3 = settings.promptSection3;
  if (settings.promptSection4) customSections.section4 = settings.promptSection4;

  const prompt = buildPrompt(
    date,
    stats,
    appContext,
    tz,
    Object.keys(customSections).length > 0 ? customSections : undefined,
  );

  return jsonOk({ prompt });
}
