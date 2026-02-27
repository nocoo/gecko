"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  List,
  Search,
  Loader2,
  RefreshCw,
  Globe,
  ExternalLink,
  ChevronDown,
  X,
  Maximize,
  Minimize,
  Clock,
} from "lucide-react";
import { CHART_COLORS } from "@/lib/palette";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Session {
  id: string;
  appName: string;
  windowTitle: string;
  url: string | null;
  startTime: number;
  endTime: number;
  duration: number;
  bundleId: string | null;
  tabTitle: string | null;
  tabCount: number;
  documentPath: string | null;
  isFullScreen: boolean;
  isMinimized: boolean;
  deviceId: string;
  syncedAt: string;
}

// ---------------------------------------------------------------------------
// Sessions Page
// ---------------------------------------------------------------------------

const PAGE_SIZE = 50;

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const offsetRef = useRef(0);

  const fetchSessions = useCallback(async (offset: number, append: boolean) => {
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const res = await fetch(`/api/sessions?limit=${PAGE_SIZE}&offset=${offset}`);
      if (!res.ok) throw new Error("Failed to load sessions");

      const data = await res.json();
      const newSessions: Session[] = data.sessions ?? [];

      if (append) {
        setSessions((prev) => [...prev, ...newSessions]);
      } else {
        setSessions(newSessions);
      }

      setHasMore(newSessions.length === PAGE_SIZE);
      offsetRef.current = offset + newSessions.length;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions(0, false);
  }, [fetchSessions]);

  const refresh = () => {
    offsetRef.current = 0;
    fetchSessions(0, false);
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      fetchSessions(offsetRef.current, true);
    }
  };

  // Filter sessions by search term (client-side)
  const filtered = search.trim()
    ? sessions.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.appName.toLowerCase().includes(q) ||
          s.windowTitle.toLowerCase().includes(q) ||
          (s.url && s.url.toLowerCase().includes(q)) ||
          (s.tabTitle && s.tabTitle.toLowerCase().includes(q)) ||
          (s.documentPath && s.documentPath.toLowerCase().includes(q))
        );
      })
    : sessions;

  return (
    <AppShell>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Sessions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Browse all recorded focus sessions.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Filter by app, title, URL..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-[240px] h-9 text-sm"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Sessions count */}
        {!loading && (
          <p className="text-xs text-muted-foreground">
            {search ? `${filtered.length} of ${sessions.length} sessions` : `${sessions.length} sessions loaded`}
            {hasMore && !search && " (scroll for more)"}
          </p>
        )}

        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center rounded-2xl bg-secondary py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState search={search} total={sessions.length} />
        ) : (
          <div className="space-y-2">
            {filtered.map((session) => (
              <SessionRow
                key={session.id}
                session={session}
                expanded={expandedId === session.id}
                onToggle={() =>
                  setExpandedId(expandedId === session.id ? null : session.id)
                }
              />
            ))}

            {/* Load more */}
            {hasMore && !search && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="ghost"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="text-sm"
                >
                  {loadingMore ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <ChevronDown className="size-4 mr-2" />
                  )}
                  Load more
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// Session Row (expandable)
// =============================================================================

/** Consistent color for an app name (hash-based). */
function appColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
}

function SessionRow({
  session,
  expanded,
  onToggle,
}: {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
}) {
  const startDate = new Date(session.startTime * 1000);
  const color = appColor(session.appName);

  return (
    <div className="rounded-2xl bg-secondary overflow-hidden">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
      >
        {/* App color dot */}
        <span
          className="size-3 rounded-full shrink-0"
          style={{ backgroundColor: color }}
        />

        {/* App name + window title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{session.appName}</span>
            {session.isFullScreen && (
              <Maximize className="size-3 text-muted-foreground" />
            )}
            {session.isMinimized && (
              <Minimize className="size-3 text-muted-foreground" />
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {session.windowTitle}
          </p>
        </div>

        {/* Duration */}
        <div className="text-right shrink-0">
          <p className="text-sm font-medium">{formatDuration(session.duration)}</p>
          <p className="text-xs text-muted-foreground">
            {formatTime(startDate)}
          </p>
        </div>

        {/* Expand arrow */}
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Detail panel */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2 text-sm">
          <DetailRow label="Time">
            <Clock className="size-3.5 mr-1" />
            {formatDateTime(new Date(session.startTime * 1000))}
            {" — "}
            {formatDateTime(new Date(session.endTime * 1000))}
          </DetailRow>

          <DetailRow label="Window">{session.windowTitle}</DetailRow>

          {session.url && (
            <DetailRow label="URL">
              <a
                href={session.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary hover:underline truncate max-w-[400px]"
              >
                <Globe className="size-3.5 shrink-0" />
                {session.url}
                <ExternalLink className="size-3 shrink-0" />
              </a>
            </DetailRow>
          )}

          {session.tabTitle && (
            <DetailRow label="Tab">{session.tabTitle}</DetailRow>
          )}

          {session.tabCount > 0 && (
            <DetailRow label="Tabs">{session.tabCount} open</DetailRow>
          )}

          {session.documentPath && (
            <DetailRow label="File">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">
                {session.documentPath}
              </code>
            </DetailRow>
          )}

          {session.bundleId && (
            <DetailRow label="Bundle ID">
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {session.bundleId}
              </code>
            </DetailRow>
          )}

          <DetailRow label="Synced">
            {formatDateTime(new Date(session.syncedAt))}
          </DetailRow>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Detail Row
// =============================================================================

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-xs text-muted-foreground w-16 shrink-0 pt-0.5 text-right">
        {label}
      </span>
      <div className="flex items-center text-sm min-w-0">{children}</div>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState({ search, total }: { search: string; total: number }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-16 px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background ring-1 ring-border mb-4">
        <List className="size-7 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h2 className="text-lg font-semibold">
        {search ? "No Matches" : "No Sessions Yet"}
      </h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        {search
          ? `No sessions match "${search}" out of ${total} total.`
          : "No sessions have been synced. Enable sync in the Gecko mac app to start tracking."}
      </p>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(seconds: number): string {
  if (seconds === 0) return "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDateTime(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  if (isToday) return `Today ${time}`;
  if (isYesterday) return `Yesterday ${time}`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
