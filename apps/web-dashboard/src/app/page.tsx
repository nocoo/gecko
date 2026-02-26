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
} from "lucide-react";

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

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { data: session } = useSession();
  const userName = session?.user?.name?.split(" ")[0] ?? "there";

  const [period, setPeriod] = useState<Period>("today");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async (p: Period) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/stats?period=${p}`);
      if (!res.ok) throw new Error("Failed to load stats");
      const data = await res.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats(period);
  }, [period, fetchStats]);

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
              onClick={() => fetchStats(period)}
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

        {/* Top apps */}
        {!loading && stats && stats.topApps.length > 0 ? (
          <TopAppsTable apps={stats.topApps} totalDuration={stats.totalDuration} />
        ) : !loading && stats && stats.topApps.length === 0 ? (
          <EmptyState period={period} />
        ) : loading ? (
          <div className="flex items-center justify-center rounded-2xl bg-secondary py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
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
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.max(pct, 1)}%` }}
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
