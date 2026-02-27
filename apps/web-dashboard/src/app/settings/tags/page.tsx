"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout";
import { TagBadge } from "@/components/tag-badge";
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
  Tags as TagsIcon,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  ArrowRightLeft,
  Search,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

interface TrackedApp {
  bundleId: string;
  appName: string;
  totalDuration: number;
  sessionCount: number;
}

interface TagMapping {
  bundleId: string;
  tagId: string;
}

// ---------------------------------------------------------------------------
// Tags Settings Page
// ---------------------------------------------------------------------------

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/tags");
      if (!res.ok) throw new Error("Failed to load tags");
      const data = await res.json();
      setTags(data.tags);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: "Tags" },
      ]}
    >
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create tags to label your apps. Each app can have multiple tags.
          </p>
        </div>

        <TagsSection
          tags={tags}
          loading={loading}
          error={error}
          setError={setError}
          onRefresh={fetchTags}
        />

        <Separator />

        <AppTagMappingsSection tags={tags} />
      </div>
    </AppShell>
  );
}

// =============================================================================
// Tags Section — CRUD
// =============================================================================

function TagsSection({
  tags,
  loading,
  error,
  setError,
  onRefresh,
}: {
  tags: Tag[];
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<Tag | null>(null);
  const [editName, setEditName] = useState("");
  const [editing, setEditing] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create tag");
      }
      setCreateName("");
      setCreateOpen(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setCreating(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------

  function openEdit(tag: Tag) {
    setEditTarget(tag);
    setEditName(tag.name);
  }

  async function handleEdit() {
    if (!editTarget) return;
    const name = editName.trim();
    if (!name) return;
    setEditing(true);
    try {
      const res = await fetch("/api/tags", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editTarget.id, name }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update tag");
      }
      setEditTarget(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setEditing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Delete
  // ---------------------------------------------------------------------------

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/tags", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete tag");
      }
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeleting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TagsIcon
            className="size-4 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="text-sm font-medium text-muted-foreground">
            Your Tags
          </h2>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          New Tag
        </Button>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-secondary p-8 text-center text-sm text-muted-foreground">
          Loading tags...
        </div>
      ) : tags.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-10 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background ring-1 ring-border mb-3">
            <TagsIcon
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
          </div>
          <p className="text-sm font-medium">No tags yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            Create tags to label and organize your apps with flexible groupings.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tags.map((tag) => (
            <TagRow
              key={tag.id}
              tag={tag}
              onEdit={() => openEdit(tag)}
              onDelete={() => setDeleteTarget(tag)}
            />
          ))}
        </div>
      )}

      {/* Create Tag Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Tag</DialogTitle>
            <DialogDescription>
              Add a new tag to label your apps.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tag-name">Name</Label>
              <Input
                id="tag-name"
                placeholder="e.g. Work, Social, Gaming"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                autoFocus
              />
            </div>
            {createName.trim() && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div>
                  <TagBadge name={createName.trim()} />
                </div>
              </div>
            )}
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
              disabled={creating || !createName.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Tag Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Tag</DialogTitle>
            <DialogDescription>
              Update the name for &ldquo;{editTarget?.name}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEdit();
                }}
                autoFocus
              />
            </div>
            {editName.trim() && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div>
                  <TagBadge name={editName.trim()} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditTarget(null)}
              disabled={editing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={editing || !editName.trim()}
            >
              {editing ? "Saving..." : "Save"}
            </Button>
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
            <DialogTitle>Delete Tag</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.name}
              &rdquo;? This tag will be removed from all apps.
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
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

// =============================================================================
// App Tag Mappings Section
// =============================================================================

function AppTagMappingsSection({ tags }: { tags: Tag[] }) {
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [mappings, setMappings] = useState<Map<string, Set<string>>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  // Track pending changes: bundleId -> Set<tagId> (the desired final state)
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, Set<string>>
  >(new Map());

  // Track which app row is expanded for tag selection
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch apps + existing mappings
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [appsRes, mappingsRes] = await Promise.all([
        fetch("/api/apps"),
        fetch("/api/tags/mappings"),
      ]);

      if (!appsRes.ok) throw new Error("Failed to load apps");
      if (!mappingsRes.ok) throw new Error("Failed to load mappings");

      const appsData = await appsRes.json();
      const mappingsData = await mappingsRes.json();

      setApps(appsData.apps);

      const map = new Map<string, Set<string>>();
      for (const m of mappingsData.mappings as TagMapping[]) {
        if (!map.has(m.bundleId)) {
          map.set(m.bundleId, new Set());
        }
        map.get(m.bundleId)!.add(m.tagId);
      }
      setMappings(map);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Toggle a tag for an app
  // ---------------------------------------------------------------------------

  function toggleTag(bundleId: string, tagId: string) {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      // Start from current effective state
      const current = getEffectiveTags(bundleId, prev);
      const updated = new Set(current);

      if (updated.has(tagId)) {
        updated.delete(tagId);
      } else {
        updated.add(tagId);
      }

      // Check if this matches the original mapping
      const original = mappings.get(bundleId) ?? new Set<string>();
      if (setsEqual(updated, original)) {
        next.delete(bundleId);
      } else {
        next.set(bundleId, updated);
      }

      return next;
    });
  }

  function getEffectiveTags(
    bundleId: string,
    pending?: Map<string, Set<string>>,
  ): Set<string> {
    const p = pending ?? pendingChanges;
    return p.get(bundleId) ?? mappings.get(bundleId) ?? new Set<string>();
  }

  // ---------------------------------------------------------------------------
  // Save changes
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (pendingChanges.size === 0) return;
    setSaving(true);
    try {
      const appsPayload = Array.from(pendingChanges.entries()).map(
        ([bundleId, tagIds]) => ({
          bundleId,
          tagIds: Array.from(tagIds),
        }),
      );

      const res = await fetch("/api/tags/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apps: appsPayload }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save tag mappings");
      }

      setPendingChanges(new Map());
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Filter apps
  // ---------------------------------------------------------------------------

  const filteredApps = apps.filter((app) => {
    const query = filter.toLowerCase();
    if (!query) return true;
    return (
      app.appName.toLowerCase().includes(query) ||
      app.bundleId.toLowerCase().includes(query)
    );
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ArrowRightLeft
            className="size-5 text-muted-foreground"
            strokeWidth={1.5}
          />
          <h2 className="text-lg font-semibold">App Tags</h2>
        </div>
        {pendingChanges.size > 0 && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving
              ? "Saving..."
              : `Save ${pendingChanges.size} change${pendingChanges.size === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Assign tags to your tracked apps. Click an app to expand and toggle
        tags. Changes are batched and saved together.
      </p>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-secondary p-8 text-center text-sm text-muted-foreground">
          Loading apps...
        </div>
      ) : tags.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-10 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background ring-1 ring-border mb-3">
            <TagsIcon
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
          </div>
          <p className="text-sm font-medium">Create tags first</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            Add some tags above before you can assign them to apps.
          </p>
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-10 px-6 text-center">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background ring-1 ring-border mb-3">
            <ArrowRightLeft
              className="size-4 text-muted-foreground"
              strokeWidth={1.5}
            />
          </div>
          <p className="text-sm font-medium">No tracked apps yet</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-xs">
            Start using the Gecko macOS app and your tracked apps will appear
            here for tagging.
          </p>
        </div>
      ) : (
        <>
          {/* Search filter */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Filter apps..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* App list */}
          <div className="space-y-1">
            {filteredApps.map((app) => {
              const effectiveTags = getEffectiveTags(app.bundleId);
              const hasChange = pendingChanges.has(app.bundleId);
              const isExpanded = expandedApp === app.bundleId;

              return (
                <AppTagRow
                  key={app.bundleId}
                  app={app}
                  tags={tags}
                  effectiveTagIds={effectiveTags}
                  hasChange={hasChange}
                  isExpanded={isExpanded}
                  onToggleExpand={() =>
                    setExpandedApp(isExpanded ? null : app.bundleId)
                  }
                  onToggleTag={(tagId) => toggleTag(app.bundleId, tagId)}
                  formatDuration={formatDuration}
                />
              );
            })}
            {filteredApps.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No apps match your filter.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

// =============================================================================
// App Tag Row — expandable with tag checkboxes
// =============================================================================

function AppTagRow({
  app,
  tags,
  effectiveTagIds,
  hasChange,
  isExpanded,
  onToggleExpand,
  onToggleTag,
  formatDuration,
}: {
  app: TrackedApp;
  tags: Tag[];
  effectiveTagIds: Set<string>;
  hasChange: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleTag: (tagId: string) => void;
  formatDuration: (seconds: number) => string;
}) {
  const assignedTags = tags.filter((t) => effectiveTagIds.has(t.id));
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!isExpanded) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onToggleExpand();
      }
    }
    // Delay to avoid capturing the click that opened the panel
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isExpanded, onToggleExpand]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "rounded-xl transition-colors",
        hasChange
          ? "bg-primary/5 ring-1 ring-primary/20"
          : "hover:bg-secondary",
      )}
    >
      {/* Header row — click to expand */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-center justify-between p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{app.appName}</p>
          <p className="text-xs text-muted-foreground truncate">
            {app.bundleId}
            <span className="ml-2">
              {formatDuration(app.totalDuration)} &middot;{" "}
              {app.sessionCount} session{app.sessionCount === 1 ? "" : "s"}
            </span>
          </p>
        </div>
        <div className="shrink-0 ml-3 flex items-center gap-2">
          {assignedTags.length > 0 ? (
            <div className="flex flex-wrap gap-1 justify-end">
              {assignedTags.map((tag) => (
                <TagBadge key={tag.id} name={tag.name} size="sm" />
              ))}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No tags</span>
          )}
        </div>
      </button>

      {/* Expanded tag selection panel */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="flex flex-wrap gap-2 rounded-lg bg-secondary p-3">
            {tags.map((tag) => {
              const isSelected = effectiveTagIds.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => onToggleTag(tag.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition-all",
                    isSelected
                      ? "ring-2 ring-primary/40"
                      : "opacity-50 hover:opacity-80",
                  )}
                >
                  {isSelected && <Check className="size-3" />}
                  <TagBadge name={tag.name} size="sm" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Tag Row
// =============================================================================

function TagRow({
  tag,
  onEdit,
  onDelete,
}: {
  tag: Tag;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
      <TagBadge name={tag.name} />
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          className="text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

// =============================================================================
// Utility
// =============================================================================

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}
