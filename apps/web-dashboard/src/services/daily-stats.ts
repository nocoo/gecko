/**
 * Daily stats calculation service.
 *
 * Pure functions that compute productivity scores from focus session data.
 * No I/O — operates on in-memory session arrays.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw DB row shape (snake_case from D1). */
export interface SessionRow {
  id: string;
  app_name: string;
  bundle_id: string | null;
  window_title: string;
  url: string | null;
  start_time: number; // Unix epoch seconds
  duration: number; // seconds
}

/** Camel-case session for API responses / Gantt chart. */
export interface SessionForChart {
  id: string;
  appName: string;
  bundleId: string | null;
  windowTitle: string;
  url: string | null;
  startTime: number;
  duration: number;
}

export interface AppSummary {
  appName: string;
  bundleId: string | null;
  totalDuration: number;
  sessionCount: number;
}

export interface DailyScores {
  focus: number; // 0-100
  deepWork: number; // 0-100
  switchRate: number; // 0-100
  concentration: number; // 0-100
  overall: number; // weighted average
}

export interface DailyStats {
  date: string;
  totalDuration: number;
  totalSessions: number;
  totalApps: number;
  activeSpan: number; // last_end - first_start (seconds)
  scores: DailyScores;
  topApps: AppSummary[];
  sessions: SessionForChart[];
}

/** Intermediate merged segment for deep work calculation. */
export interface MergedSegment {
  appName: string;
  start: number;
  end: number;
  totalDuration: number; // end - start
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MERGE_GAP_THRESHOLD = 300; // 5 minutes in seconds
const DEEP_WORK_THRESHOLD = 1800; // 30 minutes in seconds
const CONTEXT_SWITCH_MIN_DWELL = 300; // 5 min — only count switches with this much dwell time
const DWELL_GAP_THRESHOLD = 300; // 5 min — gap that breaks dwell time accumulation

/**
 * Check if a URL is a dev workflow URL that should be excluded from context switches.
 * Includes: localhost, 127.0.0.1, any URL with explicit port, hexly.ai domains.
 */
function isDevWorkflowUrl(url: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // localhost or 127.0.0.1
    if (host === "localhost" || host === "127.0.0.1") return true;
    // hexly.ai or *.hexly.ai
    if (host === "hexly.ai" || host.endsWith(".hexly.ai")) return true;
    // Any URL with explicit port (e.g., example.com:3000)
    if (parsed.port !== "") return true;
    return false;
  } catch {
    return false;
  }
}

const DEEP_WORK_MAP: Record<number, number> = {
  0: 0,
  1: 40,
  2: 60,
  3: 75,
  4: 85,
};

const WEIGHTS = {
  focus: 0.3,
  deepWork: 0.3,
  switchRate: 0.2,
  concentration: 0.2,
} as const;

// ---------------------------------------------------------------------------
// mergeAdjacentSessions
// ---------------------------------------------------------------------------

/**
 * Merge adjacent sessions of the same app with gap < 5min into segments.
 * Sessions must be sorted by start_time ascending (done internally).
 */
export function mergeAdjacentSessions(rows: SessionRow[]): MergedSegment[] {
  const sorted = [...rows].sort((a, b) => a.start_time - b.start_time);
  const [first, ...rest] = sorted;
  if (!first) return [];

  const segments: MergedSegment[] = [];
  let current: MergedSegment = {
    appName: first.app_name,
    start: first.start_time,
    end: first.start_time + first.duration,
    totalDuration: first.duration,
  };

  for (const row of rest) {
    const gap = row.start_time - current.end;
    const sameApp = row.app_name === current.appName;

    if (sameApp && gap < MERGE_GAP_THRESHOLD) {
      // Extend current segment
      const newEnd = row.start_time + row.duration;
      current.end = Math.max(current.end, newEnd);
      current.totalDuration = current.end - current.start;
    } else {
      segments.push(current);
      current = {
        appName: row.app_name,
        start: row.start_time,
        end: row.start_time + row.duration,
        totalDuration: row.duration,
      };
    }
  }
  segments.push(current);

  return segments;
}

// ---------------------------------------------------------------------------
// computeScores
// ---------------------------------------------------------------------------

/** Compute the 4 productivity dimensions + weighted overall. */
export function computeScores(rows: SessionRow[]): DailyScores {
  const sorted = [...rows].sort((a, b) => a.start_time - b.start_time);
  const [firstSession, ...rest] = sorted;
  if (!firstSession) {
    return { focus: 0, deepWork: 0, switchRate: 0, concentration: 0, overall: 0 };
  }

  const totalDuration = sorted.reduce((sum, r) => sum + r.duration, 0);
  const firstStart = firstSession.start_time;
  const lastEnd = Math.max(...sorted.map((r) => r.start_time + r.duration));
  const activeSpan = lastEnd - firstStart;

  // 1. Focus: totalDuration / activeSpan
  const focus = activeSpan > 0 ? Math.min(100, Math.round((totalDuration / activeSpan) * 100)) : 0;

  // 2. Deep Work: count merged segments >= 30min
  const merged = mergeAdjacentSessions(sorted);
  const deepSegments = merged.filter((s) => s.totalDuration >= DEEP_WORK_THRESHOLD).length;
  // deepSegments is 0..4 in the false branch; DEEP_WORK_MAP has every key.
  const deepWork = deepSegments >= 5 ? 100 : (DEEP_WORK_MAP[deepSegments] ?? 0);

  // 3. Context Switch Rate
  // Only count "deep" switches — where user stayed ≥5min in the NEW context
  // Dev workflow URLs (localhost, 127.0.0.1, ports, hexly.ai) are excluded
  let contextSwitches = 0;
  let prevAppName = firstSession.app_name;
  let prevWasDevUrl = isDevWorkflowUrl(firstSession.url);

  for (let i = 0; i < rest.length; i++) {
    const s = rest[i];
    if (!s) {
      continue;
    }

    const currIsDevUrl = isDevWorkflowUrl(s.url);

    // Skip counting if transitioning to/from a dev workflow URL
    if (currIsDevUrl || prevWasDevUrl) {
      prevAppName = s.app_name;
      prevWasDevUrl = currIsDevUrl;
      continue;
    }

    if (s.app_name !== prevAppName) {
      // Look ahead to sum duration of consecutive same-app sessions
      // but respect gap threshold — large gaps break dwell accumulation
      let dwellTime = s.duration;
      let prevEnd = s.start_time + s.duration;

      for (let j = i + 1; j < rest.length; j++) {
        const next = rest[j];
        if (!next) {
          break;
        }

        const gap = next.start_time - prevEnd;
        if (gap >= DWELL_GAP_THRESHOLD) break; // Gap too large, stop accumulating

        if (next.app_name === s.app_name) {
          dwellTime += next.duration;
          prevEnd = next.start_time + next.duration;
        } else break;
      }

      // Only count as a switch if user stayed ≥5min in the new app
      if (dwellTime >= CONTEXT_SWITCH_MIN_DWELL) {
        contextSwitches++;
      }
    }
    prevAppName = s.app_name;
    prevWasDevUrl = currIsDevUrl;
  }

  const activeHours = activeSpan / 3600;
  const switchesPerHour = activeHours > 0 ? contextSwitches / activeHours : 0;
  let switchRate: number;
  if (switchesPerHour <= 4) switchRate = 100;
  else if (switchesPerHour <= 8) switchRate = 80;
  else if (switchesPerHour <= 15) switchRate = 60;
  else if (switchesPerHour <= 25) switchRate = 40;
  else switchRate = 20;

  // 4. Concentration: top 3 apps' duration / total
  const appDurations = new Map<string, number>();
  for (const r of sorted) {
    appDurations.set(r.app_name, (appDurations.get(r.app_name) ?? 0) + r.duration);
  }
  const top3Duration = [...appDurations.values()]
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, d) => sum + d, 0);
  const concentration = totalDuration > 0 ? Math.round((top3Duration / totalDuration) * 100) : 0;

  // Overall
  const overall = Math.round(
    focus * WEIGHTS.focus +
      deepWork * WEIGHTS.deepWork +
      switchRate * WEIGHTS.switchRate +
      concentration * WEIGHTS.concentration,
  );

  return { focus, deepWork, switchRate, concentration, overall };
}

// ---------------------------------------------------------------------------
// computeDailyStats
// ---------------------------------------------------------------------------

/** Compute full daily stats from raw session rows. */
export function computeDailyStats(date: string, rows: SessionRow[]): DailyStats {
  if (rows.length === 0) {
    return {
      date,
      totalDuration: 0,
      totalSessions: 0,
      totalApps: 0,
      activeSpan: 0,
      scores: { focus: 0, deepWork: 0, switchRate: 0, concentration: 0, overall: 0 },
      topApps: [],
      sessions: [],
    };
  }

  const sorted = [...rows].sort((a, b) => a.start_time - b.start_time);

  const totalDuration = sorted.reduce((sum, r) => sum + r.duration, 0);
  const uniqueApps = new Set(sorted.map((r) => r.app_name));
  // rows.length > 0 guarded above, so sorted[0] is defined.
  const first = sorted[0];
  if (!first) {
    throw new Error("unreachable: sorted sessions empty after length guard");
  }
  const firstStart = first.start_time;
  const lastEnd = Math.max(...sorted.map((r) => r.start_time + r.duration));
  const activeSpan = lastEnd - firstStart;

  // Top apps
  const appMap = new Map<
    string,
    { bundleId: string | null; totalDuration: number; sessionCount: number }
  >();
  for (const r of sorted) {
    const existing = appMap.get(r.app_name);
    if (existing) {
      existing.totalDuration += r.duration;
      existing.sessionCount += 1;
    } else {
      appMap.set(r.app_name, {
        bundleId: r.bundle_id,
        totalDuration: r.duration,
        sessionCount: 1,
      });
    }
  }
  const topApps: AppSummary[] = [...appMap.entries()]
    .map(([appName, data]) => ({ appName, ...data }))
    .sort((a, b) => b.totalDuration - a.totalDuration);

  // Sessions for Gantt chart
  const sessions: SessionForChart[] = sorted.map((r) => ({
    id: r.id,
    appName: r.app_name,
    bundleId: r.bundle_id,
    windowTitle: r.window_title,
    url: r.url,
    startTime: r.start_time,
    duration: r.duration,
  }));

  return {
    date,
    totalDuration,
    totalSessions: sorted.length,
    totalApps: uniqueApps.size,
    activeSpan,
    scores: computeScores(sorted),
    topApps,
    sessions,
  };
}
