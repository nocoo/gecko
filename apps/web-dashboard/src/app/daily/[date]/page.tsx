/**
 * Daily Review page — /daily/[date]
 *
 * Split layout:
 * - Left: Score cards + Gantt chart timeline
 * - Right: AI analysis (Markdown)
 *
 * Date navigation via arrows + calendar popup (react-day-picker).
 * Today/future dates are forbidden.
 */

"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout";
import { GanttChart } from "@/components/daily/gantt-chart";
import { ScoreCards } from "@/components/daily/score-cards";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DayPicker } from "react-day-picker";
import type { DailyStats } from "@/services/daily-stats";
import type { AiAnalysisResult } from "@/app/api/daily/[date]/analyze/route";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DailyResponse {
  stats: DailyStats;
  ai: {
    score: number;
    result: AiAnalysisResult;
    model: string;
    generatedAt: string;
  } | null;
}

interface AnalyzeResponse {
  score: number;
  result: AiAnalysisResult;
  model: string;
  generatedAt: string;
  cached: boolean;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dateToObj(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

function objToDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Date Picker component
// ---------------------------------------------------------------------------

function DateNavigator({
  date,
  onChange,
}: {
  date: string;
  onChange: (d: string) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = todayStr();
  const canGoForward = addDays(date, 1) < today;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onChange(addDays(date, -1))}
        aria-label="Previous day"
      >
        <ChevronLeft className="size-4" />
      </Button>

      <div className="relative">
        <button
          onClick={() => setCalendarOpen(!calendarOpen)}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors"
        >
          <Calendar className="size-4 text-muted-foreground" />
          <span>{formatDateDisplay(date)}</span>
        </button>

        {calendarOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setCalendarOpen(false)}
            />
            {/* Calendar dropdown */}
            <div className="absolute top-full left-0 z-50 mt-1 rounded-xl border bg-popover p-3 shadow-lg">
              <DayPicker
                mode="single"
                selected={dateToObj(date)}
                onSelect={(d) => {
                  if (d) {
                    onChange(objToDateStr(d));
                    setCalendarOpen(false);
                  }
                }}
                disabled={[
                  { from: dateToObj(today), to: new Date(2099, 11, 31) },
                ]}
                defaultMonth={dateToObj(date)}
              />
            </div>
          </>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onChange(addDays(date, 1))}
        disabled={!canGoForward}
        aria-label="Next day"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Analysis panel
// ---------------------------------------------------------------------------

function AiAnalysisPanel({
  ai,
  loading,
  error,
  onGenerate,
}: {
  ai: AnalyzeResponse | null;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl bg-secondary p-4 flex flex-col items-center justify-center min-h-[200px]">
        <Loader2 className="size-6 animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Analyzing with AI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-secondary p-4">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="size-4 text-destructive" />
          <h3 className="text-sm font-medium text-destructive">
            Analysis failed
          </h3>
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={onGenerate}
          className="mt-3"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (!ai) {
    return (
      <div className="rounded-2xl bg-secondary p-4 flex flex-col items-center justify-center min-h-[200px]">
        <Sparkles className="size-8 text-muted-foreground mb-3" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground mb-3">
          Generate an AI-powered analysis of your day.
        </p>
        <Button onClick={onGenerate} size="sm">
          <Sparkles className="size-4 mr-1.5" />
          Analyze
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-secondary p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-sm font-medium text-muted-foreground">
            AI Analysis
          </h3>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {ai.model}
        </span>
      </div>

      {/* Highlights */}
      {ai.result.highlights.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
            Highlights
          </h4>
          <ul className="space-y-1">
            {ai.result.highlights.map((h, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm"
              >
                <span className="text-emerald-500 mt-0.5 shrink-0">+</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Improvements */}
      {ai.result.improvements.length > 0 && (
        <div className="mb-3">
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
            Improvements
          </h4>
          <ul className="space-y-1">
            {ai.result.improvements.map((imp, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm"
              >
                <span className="text-amber-500 mt-0.5 shrink-0">-</span>
                <span>{imp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Summary */}
      {ai.result.summary && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <h4 className="text-xs font-medium text-muted-foreground mb-1.5">
            Summary
          </h4>
          <div className="text-sm leading-relaxed whitespace-pre-wrap">
            {ai.result.summary}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Duration helper
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (seconds === 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) return `${minutes}m`;
  return `${Math.round(seconds)}s`;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function DailyReviewPage({
  params,
}: {
  params: Promise<{ date: string }>;
}) {
  const { date } = use(params);
  const router = useRouter();

  const [data, setData] = useState<DailyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ai, setAi] = useState<AnalyzeResponse | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Fetch daily data
  const fetchData = useCallback(async (d: string) => {
    try {
      setLoading(true);
      setError(null);
      setAi(null);
      setAiError(null);

      const res = await fetch(`/api/daily/${d}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Failed to load data (${res.status})`);
      }

      const body = (await res.json()) as DailyResponse;
      setData(body);

      // If AI result was cached, populate it
      if (body.ai) {
        setAi({
          score: body.ai.score,
          result: body.ai.result,
          model: body.ai.model,
          generatedAt: body.ai.generatedAt,
          cached: true,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(date);
  }, [date, fetchData]);

  // Generate AI analysis
  const generateAi = useCallback(async () => {
    try {
      setAiLoading(true);
      setAiError(null);

      const res = await fetch(`/api/daily/${date}/analyze`, {
        method: "POST",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `AI analysis failed (${res.status})`);
      }

      const body = (await res.json()) as AnalyzeResponse;
      setAi(body);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "AI analysis failed");
    } finally {
      setAiLoading(false);
    }
  }, [date]);

  // Navigate to a new date
  const handleDateChange = (newDate: string) => {
    router.push(`/daily/${newDate}`);
  };

  const hasData = data && data.stats.totalSessions > 0;

  return (
    <AppShell
      breadcrumbs={[
        { label: "Daily Review", href: `/daily/${yesterdayStr()}` },
        { label: formatDateDisplay(date) },
      ]}
    >
      <div className="space-y-4">
        {/* Header: Date navigation */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Daily Review</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasData
                ? `${formatDuration(data.stats.totalDuration)} across ${data.stats.totalApps} apps`
                : "View your productivity analysis for this day."}
            </p>
          </div>
          <DateNavigator date={date} onChange={handleDateChange} />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3 space-y-4">
              <LoadingSkeleton height="h-[200px]" />
              <LoadingSkeleton height="h-[300px]" />
            </div>
            <div className="lg:col-span-2">
              <LoadingSkeleton height="h-[200px]" />
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && data && !hasData && (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-16 px-6 text-center">
            <Calendar className="size-8 text-muted-foreground mb-4" strokeWidth={1.5} />
            <h2 className="text-lg font-semibold">No Data</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              No sessions recorded on {formatDateDisplay(date)}.
              Try selecting a different date.
            </p>
          </div>
        )}

        {/* Main content */}
        {!loading && hasData && (
          <div className="grid gap-4 lg:grid-cols-5">
            {/* Left: Scores + Gantt */}
            <div className="lg:col-span-3 space-y-4">
              <ScoreCards scores={data.stats.scores} />
              <GanttChart
                sessions={data.stats.sessions}
                topApps={data.stats.topApps}
              />
            </div>

            {/* Right: AI Analysis */}
            <div className="lg:col-span-2">
              <AiAnalysisPanel
                ai={ai}
                loading={aiLoading}
                error={aiError}
                onGenerate={generateAi}
              />
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function LoadingSkeleton({ height = "h-[200px]" }: { height?: string }) {
  return (
    <div className={`rounded-2xl bg-secondary p-4 ${height} flex items-center justify-center`}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
