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

import * as React from "react";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Markdown from "react-markdown";
import { AppShell } from "@/components/layout";
import { GanttChart } from "@/components/daily/gantt-chart";
import { ScoreCards } from "@/components/daily/score-cards";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Calendar,
  Sparkles,
  Loader2,
  AlertCircle,
  Clock,
  Cpu,
  Zap,
  Info,
  RefreshCw,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { CalendarDay } from "react-day-picker";
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
    prompt: string | null;
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
  prompt?: string | null;
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
  const utc = new Date(Date.UTC(parts[0] ?? 0, (parts[1] ?? 1) - 1, (parts[2] ?? 1) + days));
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

interface DayBadge {
  /** Cached AI score (0-100), or null when no analysis exists. */
  score: number | null;
  /** True only when a real (non-placeholder) AI result is cached. */
  hasAi: boolean;
}

interface SummariesResponse {
  summaries: Array<{ date: string; score: number | null; hasAi: boolean }>;
}

function formatYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function scoreColorClass(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

/**
 * Circular progress ring rendered behind a day cell.
 * `score` is 0–100, mapped to fraction of the circle filled clockwise from 12 o'clock.
 * Color follows the same thresholds as the score number used to.
 */
function ScoreRing({
  score,
  selected,
}: {
  score: number;
  selected?: boolean;
}) {
  const size = 56;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  const dashOffset = c * (1 - clamped / 100);
  return (
    <svg
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-11",
        selected ? "text-primary-foreground" : scoreColorClass(score),
      )}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className={
          selected ? "stroke-primary-foreground/30" : "stroke-muted-foreground/15"
        }
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

function DateNavigator({
  date,
  timezone,
  onChange,
}: {
  date: string;
  timezone: string;
  onChange: (d: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [badges, setBadges] = useState<Map<string, DayBadge>>(new Map());
  const fetchedMonthsRef = useRef<Set<string>>(new Set());
  const today = todayStr(timezone);
  const canGoForward = addDays(date, 1) <= today;

  // Fetch summaries for the visible month (plus a small buffer so the
  // outside-day cells from adjacent months also get badges if relevant).
  const fetchMonth = useCallback(async (monthDate: Date) => {
    const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;
    if (fetchedMonthsRef.current.has(monthKey)) return;
    fetchedMonthsRef.current.add(monthKey);

    const from = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const to = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    const fromStr = formatYMD(from);
    const toStr = formatYMD(to);

    try {
      const res = await fetch(
        `/api/daily/summaries?from=${fromStr}&to=${toStr}`,
      );
      if (!res.ok) return;
      const body = (await res.json()) as SummariesResponse;
      setBadges((prev) => {
        const next = new Map(prev);
        for (const s of body.summaries) {
          next.set(s.date, { score: s.score, hasAi: s.hasAi });
        }
        return next;
      });
    } catch {
      // Non-critical — calendar still works without badges
      fetchedMonthsRef.current.delete(monthKey);
    }
  }, []);

  // Pre-fetch the selected date's month when the popover first opens.
  useEffect(() => {
    if (!open) return;
    fetchMonth(dateToObj(date));
  }, [open, date, fetchMonth]);

  const DayButtonWithBadges = useCallback(
    ({
      day,
      modifiers,
      className,
      children,
      ...buttonProps
    }: React.ComponentProps<"button"> & {
      day: CalendarDay;
      modifiers: Record<string, boolean>;
    }) => {
      const ymd = day.isoDate;
      const badge = badges.get(ymd);
      const isOutside = modifiers.outside;
      const isSelected = modifiers.selected;
      return (
        <button
          {...buttonProps}
          className={cn(className, "relative")}
        >
          {!isOutside && badge?.hasAi && badge.score != null && (
            <ScoreRing score={badge.score} selected={isSelected} />
          )}
          {children}
        </button>
      );
    },
    [badges],
  );

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

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="font-medium"
          >
            <Calendar className="size-4 text-muted-foreground" />
            <span>{formatDateDisplay(date)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" alignOffset={-40} className="w-auto p-0">
          <CalendarPicker
            mode="single"
            selected={dateToObj(date)}
            onSelect={(d) => {
              if (d) {
                onChange(objToDateStr(d));
                setOpen(false);
              }
            }}
            disabled={[
              { from: dateToObj(addDays(today, 1)), to: new Date(2099, 11, 31) },
            ]}
            defaultMonth={dateToObj(date)}
            onMonthChange={fetchMonth}
            components={{
              DayButton: DayButtonWithBadges,
            }}
          />
        </PopoverContent>
      </Popover>

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
          <span className="ml-auto text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-widget">
            Cached
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-2 rounded-widget bg-secondary px-3 py-2"
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
// Prompt preview card (collapsible)
// ---------------------------------------------------------------------------

function PromptCard({
  prompt,
  collapsed,
  onToggle,
}: {
  prompt: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-card bg-secondary overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-4 md:p-5 text-left hover:bg-accent/50 transition-colors"
      >
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" strokeWidth={1.5} />
        <h3 className="text-sm font-normal text-muted-foreground">
          Prompt
        </h3>
        <span className="ml-auto text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-widget">
          {Math.round(prompt.length / 1000)}k chars
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          }`}
          strokeWidth={1.5}
        />
      </button>
      {!collapsed && (
        <div className="px-4 pb-4 md:px-5 md:pb-5">
          <pre className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap break-words max-h-[400px] overflow-y-auto rounded-widget bg-secondary p-3 font-mono">
            {prompt}
          </pre>
        </div>
      )}
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
  prompt,
  promptCollapsed,
  onTogglePrompt,
  onGenerate,
}: {
  ai: AnalyzeResponse | null;
  loading: boolean;
  error: string | null;
  prompt: string | null;
  promptCollapsed: boolean;
  onTogglePrompt: () => void;
  onGenerate: (force?: boolean) => void;
}) {
  // Show prompt card when we have a prompt (either during loading or after result)
  const promptCard = prompt ? (
    <PromptCard
      prompt={prompt}
      collapsed={promptCollapsed}
      onToggle={onTogglePrompt}
    />
  ) : null;

  if (loading) {
    return (
      <div className="space-y-4">
        {promptCard}
        <div className="rounded-card bg-secondary p-4 md:p-5 flex flex-col items-center justify-center min-h-[200px]">
          <Loader2 className="size-6 animate-spin text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Analyzing with AI...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        {promptCard}
        <div className="rounded-card bg-secondary p-4 md:p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-4 w-4 text-destructive" strokeWidth={1.5} />
            <h3 className="text-sm font-normal text-destructive">
              Analysis failed
            </h3>
          </div>
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all max-h-72 overflow-auto font-mono leading-relaxed">
            {error}
          </pre>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onGenerate()}
            className="mt-3"
          >
            Retry
          </Button>
        </div>
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
        <Button onClick={() => onGenerate()} size="sm">
          <Sparkles className="size-4 mr-1.5" />
          Analyze
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Prompt card (collapsed when result is available) */}
      {promptCard}

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
                  <span className="text-success mt-0.5 shrink-0">+</span>
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
                  <span className="text-warning mt-0.5 shrink-0">-</span>
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
                  className="rounded-widget bg-secondary px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" strokeWidth={1.5} />
                    <span className="text-xs font-medium text-muted-foreground font-display tracking-tight">
                      {seg.timeRange}
                    </span>
                    <span className="text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
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
            <div className="prose prose-sm max-w-none text-sm leading-relaxed text-foreground [&_h1]:text-base [&_h1]:font-semibold [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-medium [&_p]:mb-2 [&_p]:last:mb-0 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mb-1 [&_strong]:font-semibold [&_em]:italic [&_code]:text-xs [&_code]:bg-secondary [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded">
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
  const [aiPrompt, setAiPrompt] = useState<string | null>(null);
  const [promptCollapsed, setPromptCollapsed] = useState(false);

  // Fetch daily data
  const fetchData = useCallback(async (d: string) => {
    try {
      setLoading(true);
      setError(null);
      setAi(null);
      setAiError(null);
      setAiPrompt(null);
      setPromptCollapsed(false);

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
        if (body.ai.prompt) {
          setAiPrompt(body.ai.prompt);
          setPromptCollapsed(true); // Cached results start collapsed
        }
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

  // Generate AI analysis — calls preview-prompt (fast) + analyze (slow) in parallel
  const generateAi = useCallback(async (force?: boolean) => {
    try {
      setAiLoading(true);
      setAiError(null);
      setPromptCollapsed(false); // Expand prompt during loading

      // Fire both requests in parallel:
      // - preview-prompt returns instantly with the prompt text
      // - analyze calls the AI provider (slow)
      const qs = force ? "?force=true" : "";
      const promptFetch = fetch(`/api/daily/${date}/preview-prompt`, {
        method: "POST",
      });
      const analyzeFetch = fetch(`/api/daily/${date}/analyze${qs}`, {
        method: "POST",
      });

      // Handle prompt response as soon as it arrives
      promptFetch
        .then(async (res) => {
          if (res.ok) {
            const body = (await res.json()) as { prompt: string };
            setAiPrompt(body.prompt);
          }
        })
        .catch(() => {
          // Non-critical: prompt preview is nice-to-have
        });

      // Wait for the analyze response
      const res = await analyzeFetch;

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `AI analysis failed (${res.status})`);
      }

      const body = (await res.json()) as AnalyzeResponse;
      setAi(body);
      // Use prompt from analyze response if preview-prompt didn't return one
      if (body.prompt) {
        setAiPrompt(body.prompt);
      }
      setPromptCollapsed(true); // Collapse prompt once result arrives
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
            <h1 className="text-xl md:text-2xl font-semibold">Daily Review</h1>
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
                prompt={aiPrompt}
                promptCollapsed={promptCollapsed}
                onTogglePrompt={() => setPromptCollapsed((c) => !c)}
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
