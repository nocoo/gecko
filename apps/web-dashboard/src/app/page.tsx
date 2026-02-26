"use client";

import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout";
import { Monitor, Clock, AppWindow, Timer } from "lucide-react";

export default function DashboardPage() {
  const { data: session } = useSession();
  const userName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Welcome header */}
        <div>
          <h1 className="text-2xl font-semibold">Hey, {userName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Here&apos;s your screen time overview.
          </p>
        </div>

        {/* Stats cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Clock className="size-5" />}
            title="Total Time"
            value="—"
            subtitle="Today"
          />
          <StatCard
            icon={<AppWindow className="size-5" />}
            title="Apps Used"
            value="—"
            subtitle="Today"
          />
          <StatCard
            icon={<Monitor className="size-5" />}
            title="Sessions"
            value="—"
            subtitle="Today"
          />
          <StatCard
            icon={<Timer className="size-5" />}
            title="Longest Session"
            value="—"
            subtitle="Today"
          />
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-16 px-6 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-background ring-1 ring-border mb-4">
            <Monitor className="size-7 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <h2 className="text-lg font-semibold">No Data Yet</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Make sure the Gecko mac app is running and tracking your screen
            time. Data will appear here once sessions are recorded.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

// =============================================================================
// Components
// =============================================================================

function StatCard({
  icon,
  title,
  value,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl bg-secondary p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon}
        <span className="text-sm">{title}</span>
      </div>
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
    </div>
  );
}
