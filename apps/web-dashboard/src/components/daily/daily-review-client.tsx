/**
 * DailyReviewClient — Client Component for the Daily Review page.
 *
 * Split layout:
 * - Left: Score cards + Gantt chart timeline
 * - Right: AI analysis (Markdown) + Model details card
 *
 * Date navigation via arrows + calendar popup (react-day-picker).
 * Future dates are forbidden; today shows partial data.
 *
 * Design: Follows basalt 3-tier surface hierarchy (L0 → L1 → L2).
 */

"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
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
  Clock,
  Cpu,
  Zap,
  Info,
  RefreshCw,
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
  /** User's IANA timezone from settings (e.g. "Asia/Shanghai") */
  timezone: string;
}

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface AnalyzeResponse {
  score: number;
  result: AiAnalysisResult;
  model: string;
  provider?: string;
  generatedAt: string;
  cached: boolean;
  usage?: TokenUsage | null;
  durationMs?: number | null;
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/**
 * "Today" in the user's configured timezone.
 * Uses Intl to format the current instant, avoiding browser-local assumptions.
 */
function todayStr(tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDays(dateStr: string, days: number): string {
  const parts = dateStr.split("-").map(Number);
  const utc = new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]! + days));
  return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
}

function formatDateDisplay(dateStr: string): string {
  // Use UTC noon to avoid date-shift from browser-local midnight parsing
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function dateToObj(dateStr: string): Date {
  // Construct at UTC noon so local-tz interpretation stays on the same calendar day
  return new Date(`${dateStr}T12:00:00Z`);
}

function objToDateStr(d: Date): string {
  // DayPicker returns dates in browser-local tz; extract local parts
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Date Picker component
// ---------------------------------------------------------------------------

function DateNavigator({
  date,
  timezone,
  onChange,
}: {
  date: string;
  timezone: string;
  onChange: (d: string) => void;
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const today = todayStr(timezone);
  const canGoForward = addDays(date, 1) <= today;

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
                  { from: dateToObj(addDays(today, 1)), to: new Date(2099, 11, 31) },
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
// Model Details card (separate from AI content)
// ---------------------------------------------------------------------------

function ModelDetailsCard({ ai }: { ai: AnalyzeResponse }) {
  const items: { icon: typeof Clock; label: string; value: string }[] = [];

  if (ai.provider) {
    items.push({
      icon: Cpu,
      label: "Provider",
      value: ai.provider,
    });
  }

  items.push({
    icon: Zap,
    label: "Model",
    value: ai.model,
  });

  if (ai.durationMs != null) {
    items.push({
      icon: Clock,
      label: "Duration",
      value: `${(ai.durationMs / 1000).toFixed(1)}s`,
    });
  }

  if (ai.usage) {
    items.push({
      icon: Info,
      label: "Tokens",
      value: `${ai.usage.promptTokens} in / ${ai.usage.completionTokens} out (${ai.usage.totalTokens} total)`,
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="rounded-card bg-secondary p-4 md:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <h3 className="text-sm font-normal text-muted-foreground">
          Model Details
        </h3>
        {ai.cached && (
          <span className="ml-auto text-[11px] font-medium text-muted-foreground bg-card px-2 py-0.5 rounded-widget">
            Cached
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 rounded-widget border border-border bg-card px-3 py-2"
          >
            <item.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-sm text-foreground truncate">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
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
  onGenerate: (force?: boolean) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-card bg-secondary p-4 md:p-5 flex flex-col items-center justify-center min-h-[200px]">
        <Loader2 className="size-6 animate-spin text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">Analyzing with AI...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-card bg-secondary p-4 md:p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="h-4 w-4 text-destructive" strokeWidth={1.5} />
          <h3 className="text-sm font-normal text-destructive">
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
      <div className="rounded-card bg-secondary p-4 md:p-5 flex flex-col items-center justify-center min-h-[200px]">
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
    <div className="space-y-4">
      {/* Main AI content card */}
      <div className="rounded-card bg-secondary p-4 md:p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <h3 className="text-sm font-normal text-muted-foreground">
            AI Analysis
          </h3>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onGenerate(true)}
            disabled={loading}
            className="ml-auto"
            aria-label="Regenerate AI analysis"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Highlights */}
        {ai.result.highlights.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs text-muted-foreground mb-2">
              Highlights
            </h4>
            <ul className="space-y-1.5">
              {ai.result.highlights.map((h, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-foreground"
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
          <div className="mb-4">
            <h4 className="text-xs text-muted-foreground mb-2">
              Improvements
            </h4>
            <ul className="space-y-1.5">
              {ai.result.improvements.map((imp, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-sm text-foreground"
                >
                  <span className="text-amber-500 mt-0.5 shrink-0">-</span>
                  <span>{imp}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Time Segments */}
        {ai.result.timeSegments && ai.result.timeSegments.length > 0 && (
          <div className="mb-4">
            <h4 className="text-xs text-muted-foreground mb-2">
              Time Segments
            </h4>
            <div className="space-y-2">
              {ai.result.timeSegments.map((seg, i) => (
                <div
                  key={i}
                  className="rounded-widget border border-border bg-card px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                    <span className="text-xs font-medium text-muted-foreground font-display tracking-tight">
                      {seg.timeRange}
                    </span>
                    <span className="text-[11px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      {seg.label}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {seg.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary (Markdown rendered) */}
        {ai.result.summary && (
          <div className="pt-3 border-t border-border/50">
            <h4 className="text-xs text-muted-foreground mb-2">
              Summary
            </h4>
            <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-medium [&_p]:mb-2 [&_p]:last:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_code]:text-xs [&_code]:bg-card [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
              <Markdown>{ai.result.summary}</Markdown>
            </div>
          </div>
        )}
      </div>

      {/* Model details card (separate) */}
      <ModelDetailsCard ai={ai} />
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
// Main client component
// ---------------------------------------------------------------------------

export function DailyReviewClient({ date }: { date: string }) {
  const router = useRouter();

  const [data, setData] = useState<DailyResponse | null>(null);
  const [timezone, setTimezone] = useState("Asia/Shanghai");
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
      if (body.timezone) setTimezone(body.timezone);

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
  const generateAi = useCallback(async (force?: boolean) => {
    try {
      setAiLoading(true);
      setAiError(null);

      const qs = force ? "?force=true" : "";
      const res = await fetch(`/api/daily/${date}/analyze${qs}`, {
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
        { label: "Daily Review", href: "/daily" },
        { label: formatDateDisplay(date) },
      ]}
    >
      <div className="space-y-4">
        {/* Header: Date navigation */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg md:text-xl font-semibold">Daily Review</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasData
                ? `${formatDuration(data.stats.totalDuration)} across ${data.stats.totalApps} apps`
                : "View your productivity analysis for this day."}
            </p>
          </div>
          <DateNavigator date={date} timezone={timezone} onChange={handleDateChange} />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-widget bg-destructive/10 px-3 py-2 text-sm text-destructive">
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
          <div className="flex flex-col items-center justify-center rounded-card bg-secondary py-16 px-6 text-center">
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
                timezone={timezone}
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
    <div className={`rounded-card bg-secondary p-4 md:p-5 ${height} flex items-center justify-center`}>
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  );
}
