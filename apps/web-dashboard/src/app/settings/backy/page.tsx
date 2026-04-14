"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  HardDriveUpload,
  HardDriveDownload,
  Check,
  Copy,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Trash2,
  Plug,
  History,
  Package,
} from "lucide-react";

// =============================================================================
// Types
// =============================================================================

interface BackupEntry {
  id: string;
  tag: string | null;
  environment: string | null;
  file_size: number;
  is_single_json: number;
  created_at: string;
}

// =============================================================================
// Push Configuration Section
// =============================================================================

function PushConfigSection({
  onConfigured,
  onPushSuccess,
}: {
  onConfigured: () => void;
  onPushSuccess: () => void;
}) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Push state
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Fetch current config on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/backy/config");
        if (res.ok) {
          const data = await res.json();
          setWebhookUrl(data.webhookUrl ?? "");
          setApiKey(data.apiKey ?? "");
          setConfigured(data.configured);
          if (data.configured) onConfigured();
        }
      } catch {
        setError("Failed to load configuration");
      } finally {
        setLoading(false);
      }
    })();
  }, [onConfigured]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await fetch("/api/backy/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl, apiKey }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save");
      }

      setConfigured(true);
      setSaved(true);
      onConfigured();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/backy/test", { method: "POST" });
      const data = await res.json();

      if (res.ok && data.ok) {
        setTestResult({
          ok: true,
          message: `Connected (${data.durationMs}ms)`,
        });
      } else if (res.ok && !data.ok) {
        setTestResult({
          ok: false,
          message: `Server returned ${data.status}`,
        });
      } else {
        setTestResult({
          ok: false,
          message: data.error ?? "Connection failed",
        });
      }
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handlePush() {
    setPushing(true);
    setPushResult(null);

    try {
      const res = await fetch("/api/backy/push", { method: "POST" });
      const data = await res.json();

      if (data.ok) {
        setPushResult({
          ok: true,
          message: `Backup complete — ${data.tag} (${formatBytes(data.compressedBytes)}, ${data.durationMs}ms)`,
        });
        onPushSuccess();
      } else {
        setPushResult({
          ok: false,
          message: data.error ?? "Push failed",
        });
      }
    } catch (err) {
      setPushResult({
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setPushing(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <HardDriveUpload
          className="size-5 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h2 className="text-lg font-semibold">Push Backup</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Push your data to a Backy backup service. Configure the webhook URL and
        API key from your Backy instance.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-secondary p-5 space-y-4">
        {loading ? (
          <div className="h-24 rounded-md bg-muted animate-pulse" />
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://your-backy-instance.com/webhook/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder={
                  configured ? "Enter new key to replace" : "Your Backy API key"
                }
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                onClick={handleSave}
                disabled={saving || !webhookUrl || !apiKey}
                size="sm"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Configuration"
                )}
              </Button>

              {configured && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleTest}
                    disabled={testing}
                  >
                    {testing ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Plug className="size-4" />
                        Test Connection
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePush}
                    disabled={pushing}
                  >
                    {pushing ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Pushing...
                      </>
                    ) : (
                      <>
                        <HardDriveUpload className="size-4" />
                        Push Now
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>

            {/* Status messages */}
            <div className="space-y-1">
              {saved && (
                <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                  <Check className="size-3" /> Configuration saved
                </p>
              )}
              {testResult && (
                <p
                  className={`flex items-center gap-1 text-xs ${testResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                >
                  {testResult.ok ? (
                    <Check className="size-3" />
                  ) : (
                    <AlertTriangle className="size-3" />
                  )}
                  {testResult.message}
                </p>
              )}
              {pushResult && (
                <p
                  className={`flex items-center gap-1 text-xs ${pushResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                >
                  {pushResult.ok ? (
                    <Check className="size-3" />
                  ) : (
                    <AlertTriangle className="size-3" />
                  )}
                  {pushResult.message}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

// =============================================================================
// Backup History Section
// =============================================================================

function BackupHistorySection({ refreshKey }: { refreshKey: number }) {
  const [loading, setLoading] = useState(true);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [totalBackups, setTotalBackups] = useState(0);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/backy/history");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error ?? `Failed to load (${res.status})`,
        );
      }
      const data = await res.json();
      setProjectName(data.project_name ?? null);
      setTotalBackups(data.total_backups ?? 0);
      setBackups(data.recent_backups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory, refreshKey]);

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <History
          className="size-5 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h2 className="text-lg font-semibold">Backup History</h2>
        {!loading && totalBackups > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            ({totalBackups} total)
          </span>
        )}
      </div>

      {projectName && (
        <p className="text-sm text-muted-foreground">
          Project: <span className="font-medium text-foreground">{projectName}</span>
        </p>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-secondary p-5">
        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : backups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background ring-1 ring-border mb-3">
              <Package
                className="size-5 text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
            <p className="text-sm font-medium">No backups yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Push your first backup using the button above.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {backups.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 rounded-xl bg-background px-4 py-3 ring-1 ring-border"
              >
                <Package className="size-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {b.tag ?? "Untitled backup"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatRelativeTime(b.created_at)}
                    {b.environment && (
                      <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-micro font-medium uppercase">
                        {b.environment}
                      </span>
                    )}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {formatBytes(b.file_size)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// =============================================================================
// Pull Webhook Section
// =============================================================================

function PullWebhookSection() {
  const [exists, setExists] = useState(false);
  const [maskedKey, setMaskedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate state
  const [generating, setGenerating] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke state
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/backy/pull-key");
      if (res.ok) {
        const data = await res.json();
        setExists(data.exists);
        setMaskedKey(data.maskedKey);
      }
    } catch {
      setError("Failed to load pull key status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/backy/pull-key", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to generate key");
      }
      const data = await res.json();
      setRevealedKey(data.key);
      setExists(true);
      fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate key");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRevoke() {
    setRevoking(true);
    setError(null);

    try {
      const res = await fetch("/api/backy/pull-key", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to revoke key");
      }
      setExists(false);
      setMaskedKey(null);
      setRevokeOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke key");
    } finally {
      setRevoking(false);
    }
  }

  async function copyToClipboard(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const webhookUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/backy/pull`
      : "/api/backy/pull";

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <HardDriveDownload
          className="size-5 text-muted-foreground"
          strokeWidth={1.5}
        />
        <h2 className="text-lg font-semibold">Pull Webhook</h2>
      </div>

      <p className="text-sm text-muted-foreground">
        Allow Backy to trigger backups on a schedule. Generate a webhook key and
        configure it in your Backy instance.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-2xl bg-secondary p-5 space-y-4">
        {loading ? (
          <div className="h-16 rounded-md bg-muted animate-pulse" />
        ) : exists ? (
          <>
            {/* Webhook URL (read-only, copyable) */}
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-background px-3 py-2 text-xs font-mono break-all select-all ring-1 ring-border">
                  {webhookUrl}
                </code>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => copyToClipboard(webhookUrl)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Current key (masked) */}
            <div className="space-y-2">
              <Label>Webhook Key</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-background px-3 py-2 text-xs font-mono break-all ring-1 ring-border text-muted-foreground">
                  {maskedKey}
                </code>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                Regenerate Key
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRevokeOpen(true)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Revoke
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background ring-1 ring-border mb-3">
              <HardDriveDownload
                className="size-5 text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
            <p className="text-sm font-medium">No pull webhook configured</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Generate a webhook key to let Backy trigger scheduled backups
              automatically.
            </p>
            <Button
              onClick={handleGenerate}
              disabled={generating}
              size="sm"
              className="mt-4"
            >
              {generating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Generating...
                </>
              ) : (
                "Generate Webhook Key"
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Revealed key dialog (one-time display after generation) */}
      <Dialog
        open={!!revealedKey}
        onOpenChange={(open) => {
          if (!open) setRevealedKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook Key Generated</DialogTitle>
            <DialogDescription>
              Copy this key now and paste it in your Backy instance settings. It
              won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook URL
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-secondary px-3 py-2 text-xs font-mono break-all select-all">
                  {webhookUrl}
                </code>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => copyToClipboard(webhookUrl)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Webhook Key
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg bg-secondary px-3 py-2.5 text-xs font-mono break-all select-all">
                  {revealedKey}
                </code>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => revealedKey && copyToClipboard(revealedKey)}
                >
                  {copied ? (
                    <Check className="size-3.5 text-green-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                Store this key securely. You will not be able to see it again
                after closing this dialog.
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setRevealedKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revoke confirmation dialog */}
      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke Webhook Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke the pull webhook key? Backy will no
              longer be able to trigger scheduled backups.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRevokeOpen(false)}
              disabled={revoking}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevoke}
              disabled={revoking}
            >
              {revoking ? "Revoking..." : "Revoke Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// =============================================================================
// Main Page
// =============================================================================

export default function BackySettingsPage() {
  const [pushConfigured, setPushConfigured] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const handleConfigured = useCallback(() => setPushConfigured(true), []);
  const handlePushSuccess = useCallback(
    () => setHistoryRefreshKey((k) => k + 1),
    [],
  );

  return (
    <AppShell
      breadcrumbs={[
        { label: "Integrations" },
        { label: "Backy" },
      ]}
    >
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-semibold">Backy</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure automatic backups with Backy. Push your data to a backup
            service, or let Backy pull on a schedule.
          </p>
        </div>

        <PushConfigSection
          onConfigured={handleConfigured}
          onPushSuccess={handlePushSuccess}
        />

        {pushConfigured && (
          <>
            <Separator />
            <BackupHistorySection refreshKey={historyRefreshKey} />
          </>
        )}

        <Separator />

        <PullWebhookSection />
      </div>
    </AppShell>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  // Fall back to date string
  return new Date(iso).toLocaleDateString();
}
