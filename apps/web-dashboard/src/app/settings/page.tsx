"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  User,
  Mail,
  Globe,
  Check,
  Bell,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// ---------------------------------------------------------------------------
// Settings Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <AppShell breadcrumbs={[{ label: "Settings" }]}>
      <div className="space-y-8 max-w-2xl">
        {/* Page header */}
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your profile and preferences.
          </p>
        </div>

        {/* Profile section */}
        <ProfileSection session={session} />

        <Separator />

        {/* Timezone section */}
        <TimezoneSection />

        <Separator />

        {/* Notifications section */}
        <NotificationsSection />
      </div>
    </AppShell>
  );
}

// =============================================================================
// Profile Section (read-only, data from Google OAuth)
// =============================================================================

function ProfileSection({
  session,
}: {
  session: ReturnType<typeof useSession>["data"];
}) {
  const user = session?.user;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <User className="size-5 text-muted-foreground" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold">Profile</h2>
      </div>

      <div className="rounded-2xl bg-secondary p-5 space-y-4">
        <div className="flex items-center gap-4">
          {user?.image ? (
            <img
              src={user.image}
              alt="Avatar"
              className="size-14 rounded-full ring-2 ring-border"
            />
          ) : (
            <div className="size-14 rounded-full bg-muted flex items-center justify-center ring-2 ring-border">
              <User className="size-6 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="font-medium">{user?.name ?? "—"}</p>
            <p className="text-sm text-muted-foreground">
              Managed by Google OAuth
            </p>
          </div>
        </div>

        <Separator />

        <div className="grid gap-3 sm:grid-cols-2">
          <InfoField
            icon={<User className="size-4" />}
            label="Name"
            value={user?.name ?? "—"}
          />
          <InfoField
            icon={<Mail className="size-4" />}
            label="Email"
            value={user?.email ?? "—"}
          />
        </div>
      </div>
    </section>
  );
}

function InfoField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-sm font-medium truncate">{value}</p>
    </div>
  );
}

// =============================================================================
// Timezone Section
// =============================================================================

/** Common IANA timezones — mirrored from lib/timezone.ts for client use. */
const COMMON_TIMEZONES = [
  { value: "Asia/Shanghai", label: "China Standard Time (UTC+8)" },
  { value: "Asia/Tokyo", label: "Japan Standard Time (UTC+9)" },
  { value: "Asia/Seoul", label: "Korea Standard Time (UTC+9)" },
  { value: "Asia/Taipei", label: "Taipei Standard Time (UTC+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong Time (UTC+8)" },
  { value: "Asia/Singapore", label: "Singapore Time (UTC+8)" },
  { value: "Asia/Kolkata", label: "India Standard Time (UTC+5:30)" },
  { value: "Asia/Dubai", label: "Gulf Standard Time (UTC+4)" },
  { value: "Europe/London", label: "Greenwich Mean Time (UTC+0/+1)" },
  { value: "Europe/Paris", label: "Central European Time (UTC+1/+2)" },
  { value: "Europe/Berlin", label: "Central European Time (UTC+1/+2)" },
  { value: "Europe/Moscow", label: "Moscow Standard Time (UTC+3)" },
  { value: "America/New_York", label: "Eastern Time (UTC-5/-4)" },
  { value: "America/Chicago", label: "Central Time (UTC-6/-5)" },
  { value: "America/Denver", label: "Mountain Time (UTC-7/-6)" },
  { value: "America/Los_Angeles", label: "Pacific Time (UTC-8/-7)" },
  { value: "America/Anchorage", label: "Alaska Time (UTC-9/-8)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (UTC-10)" },
  { value: "Pacific/Auckland", label: "New Zealand Time (UTC+12/+13)" },
  { value: "Australia/Sydney", label: "Australian Eastern Time (UTC+10/+11)" },
];

function TimezoneSection() {
  const [timezone, setTimezone] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current timezone on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/timezone");
        if (res.ok) {
          const data = await res.json();
          setTimezone(data.timezone);
        }
      } catch {
        // Fall back to default
        setTimezone("Asia/Shanghai");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleChange(newTz: string) {
    setTimezone(newTz);
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/settings/timezone", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: newTz }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save timezone");
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save timezone");
    } finally {
      setSaving(false);
    }
  }

  function handleDetect() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected && detected !== timezone) {
      handleChange(detected);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Globe className="size-5 text-muted-foreground" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold">Timezone</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Your timezone determines how daily boundaries are calculated for
        stats, charts, and AI analysis.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-secondary p-5 space-y-4">
        <div className="space-y-2">
          <Label htmlFor="timezone-select">Timezone</Label>
          {loading ? (
            <div className="h-10 rounded-md bg-muted animate-pulse" />
          ) : (
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <Select
                  id="timezone-select"
                  value={timezone}
                  onChange={(e) => handleChange(e.target.value)}
                  disabled={saving}
                >
                  {/* If the current timezone isn't in COMMON_TIMEZONES, show it as a custom option */}
                  {!COMMON_TIMEZONES.some((t) => t.value === timezone) && timezone && (
                    <option value={timezone}>{timezone}</option>
                  )}
                  {COMMON_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDetect}
                disabled={saving}
              >
                Detect
              </Button>
            </div>
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving && <span>Saving...</span>}
          {saved && (
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <Check className="size-3" /> Saved
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// =============================================================================
// Notifications Section
// =============================================================================

interface NotificationSettings {
  autoSummarize: boolean;
  emailEnabled: boolean;
  emailAddress: string;
}

function NotificationsSection() {
  const [settings, setSettings] = useState<NotificationSettings>({
    autoSummarize: false,
    emailEnabled: false,
    emailAddress: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load settings on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/settings/notifications");
        if (res.ok) {
          const data = await res.json();
          setSettings({
            autoSummarize: data.autoSummarize ?? false,
            emailEnabled: data.emailEnabled ?? false,
            emailAddress: data.emailAddress ?? "",
          });
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave(updates: Partial<NotificationSettings>) {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="size-5 text-muted-foreground" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold">Notifications</h2>
        </div>
        <div className="rounded-2xl bg-secondary p-5">
          <div className="flex items-center justify-center py-4">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="size-5 text-muted-foreground" strokeWidth={1.5} />
        <h2 className="text-lg font-semibold">Notifications</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure automatic analysis and email notifications for your daily reports.
      </p>

      <div className="rounded-2xl bg-secondary p-5 space-y-5">
        {/* Auto-summarize toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background">
              <Sparkles className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <div className="min-w-0">
              <Label htmlFor="auto-summarize" className="text-sm font-medium">Auto-summarize</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Automatically generate AI summaries for your daily screen time.
              </p>
            </div>
          </div>
          <ToggleSwitch
            id="auto-summarize"
            checked={settings.autoSummarize}
            onChange={(checked) => handleSave({ autoSummarize: checked })}
            disabled={saving}
          />
        </div>

        <Separator />

        {/* Email notifications */}
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-background">
                <Mail className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <Label htmlFor="email-notifications" className="text-sm font-medium">Email notifications</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Receive daily analysis reports via email.
                </p>
              </div>
            </div>
            <ToggleSwitch
              id="email-notifications"
              checked={settings.emailEnabled}
              onChange={(checked) => handleSave({ emailEnabled: checked })}
              disabled={saving}
            />
          </div>

          {/* Email address input - only show when enabled */}
          {settings.emailEnabled && (
            <div className="ml-12 space-y-2">
              <Label htmlFor="email-address" className="text-sm">
                Email address
              </Label>
              <Input
                id="email-address"
                type="email"
                placeholder="your@email.com"
                value={settings.emailAddress}
                onChange={(e) => setSettings((s) => ({ ...s, emailAddress: e.target.value }))}
                onBlur={() => handleSave({ emailAddress: settings.emailAddress })}
                disabled={saving}
                className="max-w-sm"
              />
            </div>
          )}
        </div>

        {/* Status */}
        {(saving || saved) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saving && <span>Saving...</span>}
            {saved && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="size-3" /> Saved
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// =============================================================================
// Toggle Switch Component
// =============================================================================

function ToggleSwitch({
  id,
  checked,
  onChange,
  disabled,
}: {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${checked ? "bg-foreground" : "bg-muted"}`}
    >
      <span
        className={`pointer-events-none block h-5 w-5 rounded-full bg-background shadow-sm transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}
