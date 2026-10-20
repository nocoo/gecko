"use client";

import { InputArea } from "@nocoo/basalt/components/input-area";
import { InputGroup } from "@nocoo/basalt/components/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@nocoo/basalt/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";
import { ToggleGroup, ToggleGroupItem } from "@nocoo/basalt/components/toggle-group";
import {
  AlertTriangle,
  AppWindow,
  ArrowUpDown,
  Pencil,
  Plus,
  Save,
  Search,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CategoryPill } from "@/components/category-pill";
import { AppShell } from "@/components/layout";
import { TagBadge } from "@/components/tag-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrackedApp {
  bundleId: string;
  appName: string;
  totalDuration: number;
  sessionCount: number;
}

interface Category {
  id: string;
  title: string;
  icon: string;
  isDefault: boolean;
  slug: string;
}

interface Tag {
  id: string;
  name: string;
}

type SortField = "name" | "duration" | "sessions";
type SortDir = "asc" | "desc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Apps Page
// ---------------------------------------------------------------------------

export default function AppsPage() {
  // Data
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);

  // Original server state
  const [categoryMappings, setCategoryMappings] = useState<Map<string, string>>(new Map());
  const [tagMappings, setTagMappings] = useState<Map<string, Set<string>>>(new Map());
  const [notes, setNotes] = useState<Map<string, string>>(new Map());

  // Pending changes
  const [pendingCategories, setPendingCategories] = useState<Map<string, string>>(new Map());
  const [pendingTags, setPendingTags] = useState<Map<string, Set<string>>>(new Map());
  const [pendingNotes, setPendingNotes] = useState<Map<string, string>>(new Map());

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortField, setSortField] = useState<SortField>("duration");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Expanded rows
  const [expandedTagApp, setExpandedTagApp] = useState<string | null>(null);
  const [expandedNoteApp, setExpandedNoteApp] = useState<string | null>(null);
  const [expandedCatApp, setExpandedCatApp] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Fetch all data
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [appsRes, catsRes, tagsRes, catMapRes, tagMapRes, notesRes] = await Promise.all([
        fetch("/api/apps"),
        fetch("/api/categories"),
        fetch("/api/tags"),
        fetch("/api/categories/mappings"),
        fetch("/api/tags/mappings"),
        fetch("/api/apps/notes"),
      ]);

      if (!appsRes.ok) throw new Error("Failed to load apps");
      if (!catsRes.ok) throw new Error("Failed to load categories");
      if (!tagsRes.ok) throw new Error("Failed to load tags");
      if (!catMapRes.ok) throw new Error("Failed to load category mappings");
      if (!tagMapRes.ok) throw new Error("Failed to load tag mappings");
      if (!notesRes.ok) throw new Error("Failed to load notes");

      const [appsData, catsData, tagsData, catMapData, tagMapData, notesData] = await Promise.all([
        appsRes.json(),
        catsRes.json(),
        tagsRes.json(),
        catMapRes.json(),
        tagMapRes.json(),
        notesRes.json(),
      ]);

      setApps(appsData.apps);
      setCategories(catsData.categories);
      setTags(tagsData.tags);

      // Category mappings
      const catMap = new Map<string, string>();
      for (const m of catMapData.mappings) {
        catMap.set(m.bundleId, m.categoryId);
      }
      setCategoryMappings(catMap);

      // Tag mappings
      const tagMap = new Map<string, Set<string>>();
      for (const m of tagMapData.mappings) {
        if (!tagMap.has(m.bundleId)) {
          tagMap.set(m.bundleId, new Set());
        }
        tagMap.get(m.bundleId)?.add(m.tagId);
      }
      setTagMappings(tagMap);

      // Notes
      const noteMap = new Map<string, string>();
      for (const n of notesData.notes) {
        noteMap.set(n.bundleId, n.note);
      }
      setNotes(noteMap);

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
  // Effective state (pending override or original)
  // ---------------------------------------------------------------------------

  function getEffectiveCategory(bundleId: string): string {
    return pendingCategories.get(bundleId) ?? categoryMappings.get(bundleId) ?? "";
  }

  function getEffectiveTags(bundleId: string): Set<string> {
    return pendingTags.get(bundleId) ?? tagMappings.get(bundleId) ?? new Set<string>();
  }

  function getEffectiveNote(bundleId: string): string {
    return pendingNotes.get(bundleId) ?? notes.get(bundleId) ?? "";
  }

  // ---------------------------------------------------------------------------
  // Change handlers
  // ---------------------------------------------------------------------------

  function handleCategoryChange(bundleId: string, categoryId: string) {
    setPendingCategories((prev) => {
      const next = new Map(prev);
      if ((categoryMappings.get(bundleId) ?? "") === categoryId) {
        next.delete(bundleId);
      } else {
        next.set(bundleId, categoryId);
      }
      return next;
    });
  }

  function toggleTag(bundleId: string, tagId: string) {
    setPendingTags((prev) => {
      const next = new Map(prev);
      const current = new Set(prev.get(bundleId) ?? tagMappings.get(bundleId) ?? new Set<string>());

      if (current.has(tagId)) {
        current.delete(tagId);
      } else {
        current.add(tagId);
      }

      const original = tagMappings.get(bundleId) ?? new Set<string>();
      if (setsEqual(current, original)) {
        next.delete(bundleId);
      } else {
        next.set(bundleId, current);
      }
      return next;
    });
  }

  function handleNoteChange(bundleId: string, note: string) {
    setPendingNotes((prev) => {
      const next = new Map(prev);
      const original = notes.get(bundleId) ?? "";
      if (note === original) {
        next.delete(bundleId);
      } else {
        next.set(bundleId, note);
      }
      return next;
    });
  }

  // ---------------------------------------------------------------------------
  // Create new tag inline
  // ---------------------------------------------------------------------------

  async function createTag(name: string): Promise<Tag | null> {
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const newTag: Tag = { id: data.id, name: data.name };
      setTags((prev) => [...prev, newTag]);
      return newTag;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Total pending count
  // ---------------------------------------------------------------------------

  const totalPending = pendingCategories.size + pendingTags.size + pendingNotes.size;

  function hasAppChange(bundleId: string): boolean {
    return (
      pendingCategories.has(bundleId) || pendingTags.has(bundleId) || pendingNotes.has(bundleId)
    );
  }

  // ---------------------------------------------------------------------------
  // Save all changes
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (totalPending === 0) return;
    setSaving(true);
    setError(null);

    try {
      const promises: Promise<Response>[] = [];

      // Save category mapping changes
      if (pendingCategories.size > 0) {
        const mappingsToSave = Array.from(pendingCategories.entries()).map(
          ([bundleId, categoryId]) => ({ bundleId, categoryId }),
        );
        promises.push(
          fetch("/api/categories/mappings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mappings: mappingsToSave }),
          }),
        );
      }

      // Save tag mapping changes
      if (pendingTags.size > 0) {
        const appsPayload = Array.from(pendingTags.entries()).map(([bundleId, tagIds]) => ({
          bundleId,
          tagIds: Array.from(tagIds),
        }));
        promises.push(
          fetch("/api/tags/mappings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ apps: appsPayload }),
          }),
        );
      }

      // Save note changes (each note is a separate PUT/DELETE)
      for (const [bundleId, note] of pendingNotes.entries()) {
        const trimmed = note.trim();
        if (trimmed) {
          promises.push(
            fetch("/api/apps/notes", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bundleId, note: trimmed }),
            }),
          );
        } else {
          promises.push(
            fetch("/api/apps/notes", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bundleId }),
            }),
          );
        }
      }

      const results = await Promise.all(promises);
      for (const res of results) {
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error ?? "Failed to save changes");
        }
      }

      // Clear pending and refresh
      setPendingCategories(new Map());
      setPendingTags(new Map());
      setPendingNotes(new Map());
      setExpandedTagApp(null);
      setExpandedNoteApp(null);
      setExpandedCatApp(null);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Discard all changes
  // ---------------------------------------------------------------------------

  function handleDiscard() {
    setPendingCategories(new Map());
    setPendingTags(new Map());
    setPendingNotes(new Map());
    setExpandedTagApp(null);
    setExpandedNoteApp(null);
    setExpandedCatApp(null);
  }

  // ---------------------------------------------------------------------------
  // Filter + sort
  // ---------------------------------------------------------------------------

  const filteredApps = apps
    .filter((app) => {
      const query = filter.toLowerCase();
      if (!query) return true;
      return (
        app.appName.toLowerCase().includes(query) || app.bundleId.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "name":
          cmp = a.appName.localeCompare(b.appName);
          break;
        case "duration":
          cmp = a.totalDuration - b.totalDuration;
          break;
        case "sessions":
          cmp = a.sessionCount - b.sessionCount;
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <AppShell breadcrumbs={[{ label: "Apps" }]}>
      <div className="space-y-6 max-w-3xl">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Apps</h1>
            <p className="mt-1 text-sm text-basalt-muted-foreground">
              Manage categories, tags, and notes for all your tracked apps.
            </p>
          </div>
          {totalPending > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleDiscard} disabled={saving}>
                <X />
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save />
                {saving
                  ? "Saving..."
                  : `Save ${totalPending} change${totalPending === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-basalt-destructive/10 px-3 py-2 text-sm text-basalt-destructive">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <AppsSkeleton />
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-basalt-secondary py-10 px-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-basalt-background ring-1 ring-basalt-border mb-3">
              <AppWindow className="size-4 text-basalt-muted-foreground" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-medium">No tracked apps yet</p>
            <p className="mt-1 text-xs text-basalt-muted-foreground max-w-xs">
              Start using the Gecko macOS app and your tracked apps will appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Filter + sort controls */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-40 flex-1">
                <InputGroup>
                  <InputGroup.Addon>
                    <Search aria-hidden="true" />
                  </InputGroup.Addon>
                  <InputGroup.Input
                    aria-label="Filter apps"
                    placeholder="Filter by name or bundle ID..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                </InputGroup>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ArrowUpDown className="size-4 text-basalt-muted-foreground" strokeWidth={1.5} />
                <Select
                  value={`${sortField}-${sortDir}`}
                  onValueChange={(value) => {
                    const [field, dir] = value.split("-") as [SortField, SortDir];
                    setSortField(field);
                    setSortDir(dir);
                  }}
                >
                  <SelectTrigger
                    aria-label={`Sort apps by ${sortField}, ${sortDir === "asc" ? "ascending" : "descending"}`}
                    className="w-44"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="duration-desc">Most used</SelectItem>
                    <SelectItem value="duration-asc">Least used</SelectItem>
                    <SelectItem value="name-asc">Name A-Z</SelectItem>
                    <SelectItem value="name-desc">Name Z-A</SelectItem>
                    <SelectItem value="sessions-desc">Most sessions</SelectItem>
                    <SelectItem value="sessions-asc">Fewest sessions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* App list */}
            <div className="space-y-3">
              {filteredApps.map((app) => (
                <AppRow
                  key={app.bundleId}
                  app={app}
                  categories={categories}
                  tags={tags}
                  effectiveCategoryId={getEffectiveCategory(app.bundleId)}
                  effectiveTagIds={getEffectiveTags(app.bundleId)}
                  effectiveNote={getEffectiveNote(app.bundleId)}
                  hasChange={hasAppChange(app.bundleId)}
                  isCatExpanded={expandedCatApp === app.bundleId}
                  isTagExpanded={expandedTagApp === app.bundleId}
                  isNoteExpanded={expandedNoteApp === app.bundleId}
                  onCategoryChange={(catId) => handleCategoryChange(app.bundleId, catId)}
                  onToggleTag={(tagId) => toggleTag(app.bundleId, tagId)}
                  onNoteChange={(note) => handleNoteChange(app.bundleId, note)}
                  onCreateTag={createTag}
                  onToggleCatExpand={() =>
                    setExpandedCatApp(expandedCatApp === app.bundleId ? null : app.bundleId)
                  }
                  onToggleTagExpand={() =>
                    setExpandedTagApp(expandedTagApp === app.bundleId ? null : app.bundleId)
                  }
                  onToggleNoteExpand={() =>
                    setExpandedNoteApp(expandedNoteApp === app.bundleId ? null : app.bundleId)
                  }
                />
              ))}
              {filteredApps.length === 0 && (
                <p className="text-sm text-basalt-muted-foreground py-4 text-center">
                  No apps match your filter.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

// =============================================================================
// Apps Skeleton (B-4 per-page skeleton)
// =============================================================================

function AppsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-2xl bg-basalt-secondary p-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <div className="h-4 w-32 rounded bg-basalt-muted animate-pulse" />
              <div className="h-3 w-48 rounded bg-basalt-muted animate-pulse" />
            </div>
            <div className="h-3 w-24 rounded bg-basalt-muted animate-pulse shrink-0" />
          </div>
          {/* Metadata */}
          <div className="mt-3 flex items-center gap-3">
            <div className="h-5 w-20 rounded-full bg-basalt-muted animate-pulse" />
            <div className="h-5 w-14 rounded-full bg-basalt-muted animate-pulse" />
            <div className="h-5 w-16 rounded-full bg-basalt-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// App Row — card layout
// =============================================================================

function AppRow({
  app,
  categories,
  tags,
  effectiveCategoryId,
  effectiveTagIds,
  effectiveNote,
  hasChange,
  isCatExpanded,
  isTagExpanded,
  isNoteExpanded,
  onCategoryChange,
  onToggleTag,
  onNoteChange,
  onCreateTag,
  onToggleCatExpand,
  onToggleTagExpand,
  onToggleNoteExpand,
}: {
  app: TrackedApp;
  categories: Category[];
  tags: Tag[];
  effectiveCategoryId: string;
  effectiveTagIds: Set<string>;
  effectiveNote: string;
  hasChange: boolean;
  isCatExpanded: boolean;
  isTagExpanded: boolean;
  isNoteExpanded: boolean;
  onCategoryChange: (categoryId: string) => void;
  onToggleTag: (tagId: string) => void;
  onNoteChange: (note: string) => void;
  onCreateTag: (name: string) => Promise<Tag | null>;
  onToggleCatExpand: () => void;
  onToggleTagExpand: () => void;
  onToggleNoteExpand: () => void;
}) {
  const assignedTags = tags.filter((t) => effectiveTagIds.has(t.id));
  const selectedCategory = categories.find((c) => c.id === effectiveCategoryId);

  const [newTagName, setNewTagName] = useState("");
  const [creatingTag, setCreatingTag] = useState(false);

  async function handleCreateTag() {
    const trimmed = newTagName.trim();
    if (!trimmed || creatingTag) return;
    setCreatingTag(true);
    const newTag = await onCreateTag(trimmed);
    setCreatingTag(false);
    if (newTag) {
      setNewTagName("");
      onToggleTag(newTag.id);
    }
  }

  // Whether we have any metadata (category, tags, or note) to show
  const hasCategory = !!selectedCategory;
  const hasNote = !!effectiveNote;

  return (
    <div
      className={cn(
        "rounded-2xl bg-basalt-secondary p-4 transition-colors",
        hasChange && "ring-1 ring-basalt-primary/30",
      )}
    >
      {/* Header: App name + stats */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{app.appName}</p>
          <p className="text-xs text-basalt-muted-foreground truncate">{app.bundleId}</p>
        </div>
        <p className="shrink-0 text-xs text-basalt-muted-foreground tabular-nums">
          {formatDuration(app.totalDuration)} &middot; {app.sessionCount} session
          {app.sessionCount === 1 ? "" : "s"}
        </p>
      </div>

      {/* Metadata area */}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Category */}
        {hasCategory && (
          <span className="inline-flex min-w-0 max-w-full items-center gap-0.5">
            <CategoryPill
              title={selectedCategory.title}
              icon={selectedCategory.icon}
              colorKey={selectedCategory.slug}
              size="sm"
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onCategoryChange("")}
              className="ml-0.5"
              title="Remove category"
            >
              <X strokeWidth={2} />
            </Button>
          </span>
        )}

        <Select
          value={effectiveCategoryId || "none"}
          onValueChange={(value) => onCategoryChange(value === "none" ? "" : value)}
          open={isCatExpanded}
          onOpenChange={(open) => {
            if (open !== isCatExpanded) onToggleCatExpand();
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label={`Category for ${app.appName}`}
            className="max-w-full"
          >
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Uncategorized</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id}>
                {cat.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Separator dot */}
        <span className="text-basalt-muted-foreground/30 text-xs select-none">&middot;</span>

        {/* Tags */}
        {assignedTags.map((tag) => (
          <span key={tag.id} className="inline-flex min-w-0 max-w-full items-center gap-0.5">
            <TagBadge name={tag.name} size="sm" />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onToggleTag(tag.id)}
              className="ml-0.5"
              title={`Remove tag "${tag.name}"`}
            >
              <X strokeWidth={2} />
            </Button>
          </span>
        ))}

        <Popover
          open={isTagExpanded}
          onOpenChange={(open) => {
            if (open !== isTagExpanded) onToggleTagExpand();
          }}
        >
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" aria-label={`Edit tags for ${app.appName}`}>
              <Plus />
              Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-72 max-w-[calc(100vw-2rem)]"
            aria-label={`Tags for ${app.appName}`}
          >
            {tags.length > 0 && (
              <ToggleGroup
                type="multiple"
                aria-label="Assigned tags"
                value={[...effectiveTagIds]}
                onValueChange={(values) => {
                  for (const tag of tags) {
                    if (values.includes(tag.id) !== effectiveTagIds.has(tag.id))
                      onToggleTag(tag.id);
                  }
                }}
                className="mb-2 flex-wrap justify-start"
              >
                {tags.map((tag) => (
                  <ToggleGroupItem key={tag.id} value={tag.id} className="max-w-full">
                    <span className="truncate">{tag.name}</span>
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            )}
            <div className="flex items-center gap-2">
              <TagIcon className="shrink-0" />
              <Input
                aria-label="New tag name"
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleCreateTag();
                  }
                }}
                placeholder="New tag..."
                className="min-w-0 flex-1"
              />
              <Button onClick={handleCreateTag} disabled={!newTagName.trim() || creatingTag}>
                Add
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Separator dot */}
        <span className="text-basalt-muted-foreground/30 text-xs select-none">&middot;</span>

        {/* Note */}
        {isNoteExpanded ? (
          <div className="flex items-start gap-2 w-full">
            <InputArea
              aria-label={`Note for ${app.appName}`}
              className="min-w-0 flex-1"
              rows={2}
              placeholder="Add a note (e.g. 'Work email client', 'Personal project')..."
              value={effectiveNote}
              onChange={(e) => onNoteChange(e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleNoteExpand}
              className="mt-1.5"
              title="Close"
            >
              <X strokeWidth={1.5} />
            </Button>
          </div>
        ) : hasNote ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleNoteExpand}
            className="min-w-0 max-w-full"
          >
            <span className="line-clamp-1">{effectiveNote}</span>
            <Pencil strokeWidth={1.5} />
          </Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={onToggleNoteExpand}>
            <Plus strokeWidth={2} />
            Note
          </Button>
        )}
      </div>
    </div>
  );
}
