"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout";
import { CategoryPill } from "@/components/category-pill";
import { TagBadge } from "@/components/tag-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  AppWindow,
  Search,
  ArrowUpDown,
  AlertTriangle,
  Check,
  Pencil,
  Plus,
  X,
  Save,
} from "lucide-react";
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

  // ---------------------------------------------------------------------------
  // Fetch all data
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [appsRes, catsRes, tagsRes, catMapRes, tagMapRes, notesRes] =
        await Promise.all([
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

      const [appsData, catsData, tagsData, catMapData, tagMapData, notesData] =
        await Promise.all([
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
        tagMap.get(m.bundleId)!.add(m.tagId);
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
      if (categoryMappings.get(bundleId) === categoryId) {
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
      const current = new Set(
        prev.get(bundleId) ?? tagMappings.get(bundleId) ?? new Set<string>(),
      );

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
  // Total pending count
  // ---------------------------------------------------------------------------

  const totalPending =
    pendingCategories.size + pendingTags.size + pendingNotes.size;

  function hasAppChange(bundleId: string): boolean {
    return (
      pendingCategories.has(bundleId) ||
      pendingTags.has(bundleId) ||
      pendingNotes.has(bundleId)
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
        const appsPayload = Array.from(pendingTags.entries()).map(
          ([bundleId, tagIds]) => ({
            bundleId,
            tagIds: Array.from(tagIds),
          }),
        );
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
  }

  // ---------------------------------------------------------------------------
  // Filter + sort
  // ---------------------------------------------------------------------------

  const filteredApps = apps
    .filter((app) => {
      const query = filter.toLowerCase();
      if (!query) return true;
      return (
        app.appName.toLowerCase().includes(query) ||
        app.bundleId.toLowerCase().includes(query)
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Apps</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage categories, tags, and notes for all your tracked apps.
            </p>
          </div>
          {totalPending > 0 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDiscard}
                disabled={saving}
              >
                <X className="size-4" />
                Discard
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="size-4" />
                {saving
                  ? "Saving..."
                  : `Save ${totalPending} change${totalPending === 1 ? "" : "s"}`}
              </Button>
            </div>
          )}
        </div>

        {/* Error banner */}
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
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-10 px-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background ring-1 ring-border mb-3">
              <AppWindow
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
            </div>
            <p className="text-sm font-medium">No tracked apps yet</p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs">
              Start using the Gecko macOS app and your tracked apps will appear
              here.
            </p>
          </div>
        ) : (
          <>
            {/* Filter + sort controls */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by name or bundle ID..."
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <ArrowUpDown
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <Select
                  value={`${sortField}-${sortDir}`}
                  onChange={(e) => {
                    const [field, dir] = e.target.value.split("-") as [SortField, SortDir];
                    setSortField(field);
                    setSortDir(dir);
                  }}
                  className="h-9 w-[180px]"
                >
                  <option value="duration-desc">Most used</option>
                  <option value="duration-asc">Least used</option>
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                  <option value="sessions-desc">Most sessions</option>
                  <option value="sessions-asc">Fewest sessions</option>
                </Select>
              </div>
            </div>

            {/* App list */}
            <div className="space-y-1">
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
                  isTagExpanded={expandedTagApp === app.bundleId}
                  isNoteExpanded={expandedNoteApp === app.bundleId}
                  onCategoryChange={(catId) =>
                    handleCategoryChange(app.bundleId, catId)
                  }
                  onToggleTag={(tagId) => toggleTag(app.bundleId, tagId)}
                  onNoteChange={(note) =>
                    handleNoteChange(app.bundleId, note)
                  }
                  onToggleTagExpand={() =>
                    setExpandedTagApp(
                      expandedTagApp === app.bundleId ? null : app.bundleId,
                    )
                  }
                  onToggleNoteExpand={() =>
                    setExpandedNoteApp(
                      expandedNoteApp === app.bundleId ? null : app.bundleId,
                    )
                  }
                />
              ))}
              {filteredApps.length === 0 && (
                <p className="text-sm text-muted-foreground py-4 text-center">
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
// App Row
// =============================================================================

function AppRow({
  app,
  categories,
  tags,
  effectiveCategoryId,
  effectiveTagIds,
  effectiveNote,
  hasChange,
  isTagExpanded,
  isNoteExpanded,
  onCategoryChange,
  onToggleTag,
  onNoteChange,
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
  isTagExpanded: boolean;
  isNoteExpanded: boolean;
  onCategoryChange: (categoryId: string) => void;
  onToggleTag: (tagId: string) => void;
  onNoteChange: (note: string) => void;
  onToggleTagExpand: () => void;
  onToggleNoteExpand: () => void;
}) {
  const assignedTags = tags.filter((t) => effectiveTagIds.has(t.id));
  const tagPanelRef = useRef<HTMLDivElement>(null);

  // Close tag panel on outside click
  useEffect(() => {
    if (!isTagExpanded) return;
    function handleClick(e: MouseEvent) {
      if (
        tagPanelRef.current &&
        !tagPanelRef.current.contains(e.target as Node)
      ) {
        onToggleTagExpand();
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [isTagExpanded, onToggleTagExpand]);

  const selectedCategory = categories.find((c) => c.id === effectiveCategoryId);

  return (
    <div
      className={cn(
        "rounded-xl transition-colors",
        hasChange
          ? "bg-primary/5 ring-1 ring-primary/20"
          : "hover:bg-secondary",
      )}
    >
      {/* Main row */}
      <div className="flex items-center gap-3 p-3">
        {/* App info */}
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

        {/* Category dropdown */}
        <div className="shrink-0">
          <Select
            value={effectiveCategoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="h-8 min-w-[150px] rounded-lg text-xs"
          >
            <option value="">Uncategorized</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.title}
              </option>
            ))}
          </Select>
        </div>

        {/* Tags toggle button */}
        <div className="shrink-0" ref={tagPanelRef}>
          <button
            type="button"
            onClick={onToggleTagExpand}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
              isTagExpanded
                ? "bg-primary/10 text-primary"
                : "bg-secondary text-muted-foreground hover:text-foreground",
            )}
          >
            {assignedTags.length > 0 ? (
              <span className="flex items-center gap-1">
                {assignedTags.length} tag{assignedTags.length === 1 ? "" : "s"}
              </span>
            ) : (
              "Tags"
            )}
          </button>

          {/* Tag selection dropdown */}
          {isTagExpanded && tags.length > 0 && (
            <div className="absolute z-10 mt-1 min-w-[200px] rounded-lg border bg-popover p-2 shadow-md">
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const isSelected = effectiveTagIds.has(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => onToggleTag(tag.id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium transition-all",
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

        {/* Note: inline text with edit icon, or "Add note" button */}
        {effectiveNote && !isNoteExpanded ? (
          <button
            type="button"
            onClick={onToggleNoteExpand}
            className="shrink-0 inline-flex items-center gap-1.5 max-w-[200px] text-left group"
          >
            <span className="text-xs text-muted-foreground truncate">
              {effectiveNote}
            </span>
            <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
          </button>
        ) : !isNoteExpanded ? (
          <button
            type="button"
            onClick={onToggleNoteExpand}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors bg-secondary text-muted-foreground hover:text-foreground"
          >
            <Plus className="size-3.5" strokeWidth={1.5} />
            Note
          </button>
        ) : null}
      </div>

      {/* Assigned tags display (always visible when tags exist) */}
      {assignedTags.length > 0 && !isTagExpanded && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {assignedTags.map((tag) => (
            <TagBadge key={tag.id} name={tag.name} size="sm" />
          ))}
          {selectedCategory && (
            <CategoryPill
              title={selectedCategory.title}
              icon={selectedCategory.icon}
              colorKey={selectedCategory.slug}
              size="sm"
            />
          )}
        </div>
      )}

      {/* Note editor */}
      {isNoteExpanded && (
        <div className="px-3 pb-3">
          <textarea
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring resize-none"
            rows={2}
            placeholder="Add a note about this app (e.g. 'Work email client', 'Personal project')..."
            value={effectiveNote}
            onChange={(e) => onNoteChange(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
