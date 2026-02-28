"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Monitor,
  Clock,
  AppWindow,
  Timer,
  RefreshCw,
  BarChart3,
  Loader2,
  PieChart as PieChartIcon,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { AXIS_CONFIG, BAR_RADIUS, formatDurationCompact } from "@/lib/chart-config";
import { CHART_COLORS, chartPrimary, withAlpha } from "@/lib/palette";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Period = "today" | "week" | "month" | "all";

interface Stats {
  period: Period;
  totalSessions: number;
  totalDuration: number;
  totalApps: number;
  longestSession: number;
  topApps: TopApp[];
}

interface TopApp {
  appName: string;
  bundleId: string | null;
  totalDuration: number;
  sessionCount: number;
}

interface TimelineEntry {
  date: string;
  totalDuration: number;
  sessionCount: number;
  appCount: number;
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: session } = useSession();
  const userName = session?.user?.name?.split(" ")[0] ?? "there";

  const [period, setPeriod] = useState<Period>("week");
  const [stats, setStats] = useState<Stats | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (p: Period) => {
    try {
      setLoading(true);
      setError(null);

      // Map period for timeline API (today → week for chart context)
      const timelinePeriod = p === "today" ? "week" : p === "all" ? "all" : p;

      const [statsRes, timelineRes] = await Promise.all([
        fetch(`/api/stats?period=${p}`),
        fetch(`/api/stats/timeline?period=${timelinePeriod}`),
      ]);

      if (!statsRes.ok) throw new Error("Failed to load stats");
      if (!timelineRes.ok) throw new Error("Failed to load timeline");

      const [statsData, timelineData] = await Promise.all([
        statsRes.json(),
        timelineRes.json(),
      ]);

      setStats(statsData);
      setTimeline(timelineData.timeline ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  const hasData = stats && stats.totalSessions > 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Welcome header + period selector */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Hey, {userName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Here&apos;s your screen time overview.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PeriodSelector value={period} onChange={setPeriod} />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => fetchData(period)}
              disabled={loading}
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Stats cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Clock className="size-5" />}
            title="Total Time"
            value={formatDuration(stats?.totalDuration ?? 0)}
            subtitle={periodLabel(period)}
            loading={loading}
          />
          <StatCard
            icon={<AppWindow className="size-5" />}
            title="Apps Used"
            value={stats?.totalApps?.toString() ?? "0"}
            subtitle={periodLabel(period)}
            loading={loading}
          />
          <StatCard
            icon={<Monitor className="size-5" />}
            title="Sessions"
            value={stats?.totalSessions?.toString() ?? "0"}
            subtitle={periodLabel(period)}
            loading={loading}
          />
          <StatCard
            icon={<Timer className="size-5" />}
            title="Longest Session"
            value={formatDuration(stats?.longestSession ?? 0)}
            subtitle={periodLabel(period)}
            loading={loading}
          />
        </div>

        {/* Charts row */}
        {loading ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <ChartSkeleton className="lg:col-span-3" />
            <ChartSkeleton className="lg:col-span-2" />
          </div>
        ) : hasData ? (
          <div className="grid gap-4 lg:grid-cols-5">
            <DailyChart timeline={timeline} className="lg:col-span-3" />
            <AppDonut apps={stats.topApps} className="lg:col-span-2" />
          </div>
        ) : null}

        {/* Top apps */}
        {!loading && hasData ? (
          <TopAppsTable apps={stats.topApps} totalDuration={stats.totalDuration} />
        ) : !loading && stats && stats.topApps.length === 0 ? (
          <EmptyState period={period} />
        ) : null}
      </div>
    </AppShell>
  );
}

// =============================================================================
// Period Selector
// =============================================================================

const PERIODS: { value: Period; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "7 Days" },
  { value: "month", label: "30 Days" },
  { value: "all", label: "All Time" },
];

function PeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div className="flex rounded-lg bg-secondary p-1">
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === p.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// Stat Card
// =============================================================================

function StatCard({
  icon,
  title,
  value,
  subtitle,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl bg-secondary p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      {loading ? (
        <div className="h-8 w-20 animate-pulse rounded-md bg-muted" />
      ) : (
        <p className="text-2xl font-semibold">{value}</p>
      )}
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}

// =============================================================================
// Daily Screen Time Bar Chart
// =============================================================================

function DailyChart({
  timeline,
  className = "",
}: {
  timeline: TimelineEntry[];
  className?: string;
}) {
  // Format dates for display: "Mon 24", "Tue 25", etc.
  const chartData = timeline.map((entry) => {
    const d = new Date(entry.date + "T00:00:00");
    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
    const dayNum = d.getDate();
    return {
      label: `${dayName} ${dayNum}`,
      hours: Number((entry.totalDuration / 3600).toFixed(2)),
      duration: entry.totalDuration,
      sessions: entry.sessionCount,
      apps: entry.appCount,
    };
  });

  return (
    <div className={`rounded-2xl bg-secondary p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="size-5 text-muted-foreground" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold">Daily Screen Time</h2>
      </div>
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={withAlpha("chart-muted", 0.5)}
            />
            <XAxis
              dataKey="label"
              {...AXIS_CONFIG}
            />
            <YAxis
              {...AXIS_CONFIG}
              tickFormatter={(v: number) => formatDurationCompact(v * 3600)}
            />
            <RechartsTooltip content={<DailyTooltip />} isAnimationActive={false} />
            <Bar
              dataKey="hours"
              fill={chartPrimary}
              radius={BAR_RADIUS.vertical}
              maxBarSize={48}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DailyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; duration: number; sessions: number; apps: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{data.label}</p>
      <p className="text-muted-foreground">
        {formatDuration(data.duration)} &middot; {data.sessions} sessions
      </p>
    </div>
  );
}

// =============================================================================
// App Usage Donut Chart
// =============================================================================

function AppDonut({
  apps,
  className = "",
}: {
  apps: TopApp[];
  className?: string;
}) {
  // Take top 5, merge rest into "Other"
  const top = apps.slice(0, 5);
  const rest = apps.slice(5);
  const restTotal = rest.reduce((sum, a) => sum + a.totalDuration, 0);

  const chartData = top.map((app, i) => ({
    name: app.appName,
    value: app.totalDuration,
    color: CHART_COLORS[i],
  }));

  if (restTotal > 0) {
    chartData.push({
      name: "Other",
      value: restTotal,
      color: CHART_COLORS[5],
    });
  }

  const totalDuration = apps.reduce((sum, a) => sum + a.totalDuration, 0);

  return (
    <div className={`rounded-2xl bg-secondary p-4 ${className}`}>
      <div className="flex items-center gap-2 mb-4">
        <PieChartIcon className="size-5 text-muted-foreground" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold">App Usage</h2>
      </div>
      <div className="h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <RechartsTooltip content={<DonutTooltip total={totalDuration} />} isAnimationActive={false} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
        {chartData.map((entry, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block size-2.5 rounded-full shrink-0"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground truncate max-w-[100px]">
              {entry.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number } }>;
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const pct = total > 0 ? ((data.value / total) * 100).toFixed(1) : "0";

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="font-medium">{data.name}</p>
      <p className="text-muted-foreground">
        {formatDuration(data.value)} ({pct}%)
      </p>
    </div>
  );
}

// =============================================================================
// Chart Skeleton
// =============================================================================

function ChartSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-2xl bg-secondary p-4 ${className}`}>
      <div className="h-5 w-40 animate-pulse rounded-md bg-muted mb-4" />
      <div className="h-[280px] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    </div>
  );
}

// =============================================================================
// Top Apps Table
// =============================================================================

function TopAppsTable({
  apps,
  totalDuration,
}: {
  apps: TopApp[];
  totalDuration: number;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3
          className="size-5 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h2 className="text-lg font-semibold">Top Apps</h2>
      </div>

      <div className="space-y-2">
        {apps.map((app, i) => {
          const pct =
            totalDuration > 0 ? (app.totalDuration / totalDuration) * 100 : 0;

          return (
            <div
              key={app.appName}
              className="flex items-center gap-3 rounded-2xl bg-secondary p-3"
            >
              {/* Rank */}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background text-xs font-medium ring-1 ring-border">
                {i + 1}
              </span>

              {/* App info + bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {app.appName}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDuration(app.totalDuration)}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.max(pct, 1)}%`,
                      backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                    }}
                  />
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{app.sessionCount} sessions</span>
                  <span>{pct.toFixed(1)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState({ period }: { period: Period }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-16 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background ring-1 ring-border mb-4">
        <Monitor
          className="size-7 text-muted-foreground"
          strokeWidth={1.5}
        />
      </div>
      <h2 className="text-lg font-semibold">No Data Yet</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {period === "today"
          ? "No sessions recorded today. Make sure the Gecko mac app is running."
          : "No sessions found for this period. Try selecting a different time range."}
      </p>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

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

function periodLabel(period: Period): string {
  switch (period) {
    case "today":
      return "Today";
    case "week":
      return "Last 7 days";
    case "month":
      return "Last 30 days";
    case "all":
      return "All time";
  }
}
