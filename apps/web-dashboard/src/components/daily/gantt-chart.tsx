/**
 * Gantt chart component for the daily review page.
 *
 * Displays a horizontal timeline where each row is an app,
 * and colored bars represent time segments throughout the day.
 * Sorted by total duration (highest at top).
 * Uses hash-based stable coloring per app.
 *
 * Design: basalt L2 card (rounded-card bg-secondary p-4 md:p-5),
 * inner elements use L1 styling.
 */

"use client";

import { formatDurationCompact } from "@/lib/chart-config";
import { withAlpha } from "@/lib/palette";
import { getHashColor } from "@/lib/hash-color";
import { localDateToUTCEpoch, epochToDateStr } from "@/lib/timezone";
import type { SessionForChart, AppSummary } from "@/services/daily-stats";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GanttChartProps {
  sessions: SessionForChart[];
  topApps: AppSummary[];
  /** User's IANA timezone (e.g. "Asia/Shanghai") for midnight calculation */
  timezone: string;
  className?: string;
}

/** A single segment on the Gantt chart. */
interface GanttSegment {
  appName: string;
  /** Offset from midnight in minutes (for X positioning) */
  startMin: number;
  /** Duration in minutes */
  durationMin: number;
  /** Original duration in seconds for tooltip */
  durationSec: number;
  windowTitle: string;
  color: string;
}

/** One row in the Gantt chart data. */
interface GanttRow {
  appName: string;
  totalDuration: number;
  segments: GanttSegment[];
}

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

/**
 * Transform sessions + topApps into Gantt rows.
 * One row per app, sorted by total duration descending.
 *
 * @param tz - User's IANA timezone. Used to compute the local midnight
 *   reference point so the X-axis shows times in the user's timezone.
 */
export function buildGanttData(
  sessions: SessionForChart[],
  topApps: AppSummary[],
  tz: string,
): { rows: GanttRow[]; dayStartMin: number; dayEndMin: number } {
  if (sessions.length === 0) {
    return { rows: [], dayStartMin: 0, dayEndMin: 0 };
  }

  // Determine day range
  const allStarts = sessions.map((s) => s.startTime);
  const allEnds = sessions.map((s) => s.startTime + s.duration);
  const dayStartEpoch = Math.min(...allStarts);
  const dayEndEpoch = Math.max(...allEnds);

  // Compute midnight in the user's timezone by reusing the core timezone lib.
  // Format the first session's epoch as a date string in the target tz,
  // then convert that date's midnight back to a UTC epoch.
  const dateStr = epochToDateStr(dayStartEpoch, tz);
  const midnightEpoch = localDateToUTCEpoch(dateStr, tz);

  const dayStartMin = Math.floor((dayStartEpoch - midnightEpoch) / 60);
  const dayEndMin = Math.ceil((dayEndEpoch - midnightEpoch) / 60);

  // Build rows from topApps order (already sorted by total duration desc)
  const sessionsByApp = new Map<string, SessionForChart[]>();
  for (const s of sessions) {
    const existing = sessionsByApp.get(s.appName);
    if (existing) {
      existing.push(s);
    } else {
      sessionsByApp.set(s.appName, [s]);
    }
  }

  const rows: GanttRow[] = topApps.map((app) => {
    const appSessions = sessionsByApp.get(app.appName) ?? [];
    const color = getHashColor(app.appName).fg;

    const segments: GanttSegment[] = appSessions.map((s) => ({
      appName: s.appName,
      startMin: (s.startTime - midnightEpoch) / 60,
      durationMin: s.duration / 60,
      durationSec: s.duration,
      windowTitle: s.windowTitle,
      color,
    }));

    return {
      appName: app.appName,
      totalDuration: app.totalDuration,
      segments,
    };
  });

  return { rows, dayStartMin, dayEndMin };
}

/** Format minutes since midnight as HH:MM. */
export function formatTime(minutesSinceMidnight: number): string {
  const h = Math.floor(minutesSinceMidnight / 60);
  const m = Math.floor(minutesSinceMidnight % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GanttChart({
  sessions,
  topApps,
  timezone,
  className = "",
}: GanttChartProps) {
  const { rows, dayStartMin, dayEndMin } = buildGanttData(sessions, topApps, timezone);

  if (rows.length === 0) {
    return (
      <div className={`rounded-card bg-secondary p-4 md:p-5 ${className}`}>
        <h3 className="text-sm font-normal text-muted-foreground mb-2">
          Timeline
        </h3>
        <p className="text-sm text-muted-foreground">No sessions to display.</p>
      </div>
    );
  }

  // Always show the full 24-hour day (00:00 – 24:00)
  const xMin = 0;
  const xMax = 1440;
  const range = xMax - xMin;

  // 2-hour tick interval for a full-day view
  const ticks: number[] = [];
  for (let t = 0; t <= 1440; t += 120) {
    ticks.push(t);
  }

  return (
    <div className={`rounded-card bg-secondary p-4 md:p-5 ${className}`}>
      <h3 className="text-sm font-normal text-muted-foreground mb-3">
        Timeline
      </h3>

      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Time axis (top) */}
          <div
            className="relative mb-1 ml-[110px]"
            style={{ height: 20 }}
          >
            {ticks.map((t) => {
              const pct = ((t - xMin) / range) * 100;
              return (
                <span
                  key={t}
                  className="absolute text-[10px] text-muted-foreground -translate-x-1/2"
                  style={{ left: `${pct}%` }}
                >
                  {formatTime(t)}
                </span>
              );
            })}
          </div>

          {/* Grid lines (vertical, behind rows) */}
          <div className="relative">
            {/* Vertical grid lines */}
            <div
              className="absolute inset-0 ml-[110px] pointer-events-none"
              aria-hidden="true"
            >
              {ticks.map((t) => {
                const pct = ((t - xMin) / range) * 100;
                return (
                  <div
                    key={t}
                    className="absolute top-0 bottom-0 border-l"
                    style={{
                      left: `${pct}%`,
                      borderColor: withAlpha("chart-muted", 0.2),
                    }}
                  />
                );
              })}
            </div>

            {/* App rows */}
            {rows.map((row) => {
              const color = getHashColor(row.appName).fg;
              return (
                <div
                  key={row.appName}
                  className="flex items-center gap-0 mb-0.5"
                >
                  {/* App label */}
                  <div
                    className="shrink-0 text-xs text-muted-foreground truncate pr-2 text-right"
                    style={{ width: 110 }}
                    title={`${row.appName} — ${formatDurationCompact(row.totalDuration)}`}
                  >
                    {row.appName}
                  </div>
                  {/* Segment track */}
                  <div
                    className="relative flex-1 rounded-sm overflow-hidden"
                    style={{
                      height: 24,
                      backgroundColor: withAlpha("chart-muted", 0.1),
                    }}
                  >
                    {row.segments.map((seg, i) => {
                      // Clamp segment to visible [xMin, xMax] range
                      const segEnd = seg.startMin + seg.durationMin;
                      const clampedStart = Math.max(xMin, seg.startMin);
                      const clampedEnd = Math.min(xMax, segEnd);
                      // Skip segments entirely outside the visible range
                      if (clampedStart >= clampedEnd) return null;
                      const left = ((clampedStart - xMin) / range) * 100;
                      const width = ((clampedEnd - clampedStart) / range) * 100;
                      return (
                        <div
                          key={i}
                          className="absolute top-0.5 bottom-0.5 rounded-sm transition-opacity hover:opacity-80"
                          style={{
                            left: `${left}%`,
                            width: `${Math.max(0.3, width)}%`,
                            backgroundColor: color,
                            opacity: 0.85,
                          }}
                          title={`${seg.windowTitle}\n${formatTime(seg.startMin)} — ${formatDurationCompact(seg.durationSec)}`}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Color legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {rows.slice(0, 10).map((row) => {
          const color = getHashColor(row.appName).fg;
          return (
            <div
              key={row.appName}
              className="flex items-center gap-1.5 text-xs"
            >
              <span
                className="inline-block size-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-muted-foreground truncate max-w-[100px]">
                {row.appName}
              </span>
              <span className="text-muted-foreground">
                {formatDurationCompact(row.totalDuration)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
