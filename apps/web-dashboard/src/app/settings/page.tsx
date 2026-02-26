"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
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
  Key,
  Plus,
  Trash2,
  Copy,
  Check,
  AlertTriangle,
  Laptop,
  User,
  Mail,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKey {
  id: string;
  name: string;
  deviceId: string;
  createdAt: string;
  lastUsed: string | null;
}

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
            Manage your profile and API keys for device sync.
          </p>
        </div>

        {/* Profile section */}
        <ProfileSection session={session} />

        <Separator />

        {/* API Keys section */}
        <ApiKeysSection />
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
// API Keys Section
// =============================================================================

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);

  // Shown once after creation
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState(false);

  // -------------------------------------------------------------------------
  // Fetch keys
  // -------------------------------------------------------------------------

  const fetchKeys = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/keys");
      if (!res.ok) throw new Error("Failed to load API keys");
      const data = await res.json();
      setKeys(data.keys);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // -------------------------------------------------------------------------
  // Create key
  // -------------------------------------------------------------------------

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create API key");
      }
      const data = await res.json();
      setRevealedKey(data.key);
      setNewKeyName("");
      setCreateOpen(false);
      fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  // -------------------------------------------------------------------------
  // Delete key
  // -------------------------------------------------------------------------

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete API key");
      setDeleteTarget(null);
      fetchKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeleting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Copy to clipboard
  // -------------------------------------------------------------------------

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="size-5 text-muted-foreground" strokeWidth={1.5} />
          <h2 className="text-lg font-semibold">API Keys</h2>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New Key
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        API keys let the Gecko macOS app sync focus sessions to the cloud. Each
        key is bound to a device.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Keys list */}
      <div className="space-y-3">
        {loading ? (
          <div className="rounded-2xl bg-secondary p-8 text-center text-sm text-muted-foreground">
            Loading keys...
          </div>
        ) : keys.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-12 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-background ring-1 ring-border mb-3">
              <Key
                className="size-5 text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
            <p className="text-sm font-medium">No API keys yet</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Create an API key to start syncing focus sessions from your Mac.
            </p>
          </div>
        ) : (
          keys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between rounded-2xl bg-secondary p-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background ring-1 ring-border">
                  <Laptop className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{k.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(k.createdAt)}
                    {k.lastUsed && <> &middot; Last used {formatDate(k.lastUsed)}</>}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setDeleteTarget(k)}
                className="text-muted-foreground hover:text-destructive shrink-0"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      {/* Create Key Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
            <DialogDescription>
              Give this key a name to identify the device it will be used on.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="key-name">Device Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. MacBook Pro"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Revealed Key Dialog (one-time display) */}
      <Dialog
        open={!!revealedKey}
        onOpenChange={(open) => {
          if (!open) setRevealedKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              Copy this key now. It won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-secondary px-3 py-2.5 text-xs font-mono break-all select-all">
                {revealedKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => revealedKey && copyKey(revealedKey)}
              >
                {copied ? (
                  <Check className="size-4 text-green-500" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
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

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API Key</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke the key &ldquo;
              {deleteTarget?.name}&rdquo;? The device will no longer be able to
              sync.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              disabled={deleting}
            >
              {deleting ? "Revoking..." : "Revoke Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}
