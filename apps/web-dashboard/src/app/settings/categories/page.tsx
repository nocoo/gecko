"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout";
import { CategoryPill, AVAILABLE_ICONS } from "@/components/category-pill";
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
  Layers,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Lock,
  Cpu,
  Monitor,
  Globe,
  AppWindow,
  Folder,
  ArrowRightLeft,
  Search,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FC } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  id: string;
  title: string;
  icon: string;
  isDefault: boolean;
  slug: string;
  createdAt: string;
}

interface TrackedApp {
  bundleId: string;
  appName: string;
  totalDuration: number;
  sessionCount: number;
}

// ---------------------------------------------------------------------------
// Icon picker support — mirrors the icon map from category-pill.tsx
// ---------------------------------------------------------------------------

const ICON_COMPONENTS: Record<string, FC<LucideProps>> = {
  cpu: Cpu,
  monitor: Monitor,
  globe: Globe,
  "app-window": AppWindow,
  folder: Folder,
};

// ---------------------------------------------------------------------------
// Categories Settings Page
// ---------------------------------------------------------------------------

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Failed to load categories");
      const data = await res.json();
      setCategories(data.categories);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return (
    <AppShell
      breadcrumbs={[
        { label: "Settings", href: "/settings" },
        { label: "Categories" },
      ]}
    >
      <div className="space-y-8 max-w-2xl">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize your apps into categories. Default categories cannot be
            edited or removed.
          </p>
        </div>

        <CategoriesSection
          categories={categories}
          loading={loading}
          error={error}
          setError={setError}
          onRefresh={fetchCategories}
        />

        <Separator />

        <AppMappingsSection categories={categories} />
      </div>
    </AppShell>
  );
}

// =============================================================================
// Categories Section
// =============================================================================

function CategoriesSection({
  categories,
  loading,
  error,
  setError,
  onRefresh,
}: {
  categories: Category[];
  loading: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  onRefresh: () => void;
}) {
  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createIcon, setCreateIcon] = useState("folder");
  const [creating, setCreating] = useState(false);

  // Edit dialog
  const [editTarget, setEditTarget] = useState<Category | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editIcon, setEditIcon] = useState("folder");
  const [editing, setEditing] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [deleting, setDeleting] = useState(false);

  // ---------------------------------------------------------------------------
  // Create
  // ---------------------------------------------------------------------------

  async function handleCreate() {
    const title = createTitle.trim();
    if (!title) return;
    setCreating(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, icon: createIcon }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to create category");
      }
      setCreateTitle("");
      setCreateIcon("folder");
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

  function openEdit(cat: Category) {
    setEditTarget(cat);
    setEditTitle(cat.title);
    setEditIcon(cat.icon);
  }

  async function handleEdit() {
    if (!editTarget) return;
    const title = editTitle.trim();
    if (!title) return;
    setEditing(true);
    try {
      const res = await fetch("/api/categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editTarget.id,
          title,
          icon: editIcon,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to update category");
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
      const res = await fetch("/api/categories", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteTarget.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete category");
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

  const defaultCategories = categories.filter((c) => c.isDefault);
  const customCategories = categories.filter((c) => !c.isDefault);

  return (
    <section className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-secondary p-8 text-center text-sm text-muted-foreground">
          Loading categories...
        </div>
      ) : (
        <>
          {/* Default categories */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock
                className="size-4 text-muted-foreground"
                strokeWidth={1.5}
              />
              <h2 className="text-sm font-medium text-muted-foreground">
                Default Categories
              </h2>
            </div>

            <div className="space-y-2">
              {defaultCategories.map((cat) => (
                <CategoryRow key={cat.id} category={cat} />
              ))}
              {defaultCategories.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No default categories found.
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Custom categories */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers
                  className="size-4 text-muted-foreground"
                  strokeWidth={1.5}
                />
                <h2 className="text-sm font-medium text-muted-foreground">
                  Custom Categories
                </h2>
              </div>
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                New Category
              </Button>
            </div>

            <div className="space-y-2">
              {customCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl bg-secondary py-10 px-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background ring-1 ring-border mb-3">
                    <Layers
                      className="size-4 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                  </div>
                  <p className="text-sm font-medium">No custom categories</p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                    Create a category to group apps beyond the built-in
                    defaults.
                  </p>
                </div>
              ) : (
                customCategories.map((cat) => (
                  <CategoryRow
                    key={cat.id}
                    category={cat}
                    onEdit={() => openEdit(cat)}
                    onDelete={() => setDeleteTarget(cat)}
                  />
                ))
              )}
            </div>
          </div>
        </>
      )}

      {/* Create Category Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Category</DialogTitle>
            <DialogDescription>
              Add a new category to organize your apps.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cat-title">Title</Label>
              <Input
                id="cat-title"
                placeholder="e.g. Productivity"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <IconPicker value={createIcon} onChange={setCreateIcon} />
            </div>
            {createTitle.trim() && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div>
                  <CategoryPill
                    title={createTitle.trim()}
                    icon={createIcon}
                  />
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
              disabled={creating || !createTitle.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Category Dialog */}
      <Dialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update the title or icon for &ldquo;{editTarget?.title}&rdquo;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleEdit();
                }}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <IconPicker value={editIcon} onChange={setEditIcon} />
            </div>
            {editTitle.trim() && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div>
                  <CategoryPill title={editTitle.trim()} icon={editIcon} />
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
              disabled={editing || !editTitle.trim()}
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
            <DialogTitle>Delete Category</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{deleteTarget?.title}
              &rdquo;? Apps assigned to this category will become uncategorized.
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
// App Mappings Section
// =============================================================================

function AppMappingsSection({ categories }: { categories: Category[] }) {
  const [apps, setApps] = useState<TrackedApp[]>([]);
  const [mappings, setMappings] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");

  // Track pending changes (bundleId -> categoryId)
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, string>
  >(new Map());

  // ---------------------------------------------------------------------------
  // Fetch apps + existing mappings
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [appsRes, mappingsRes] = await Promise.all([
        fetch("/api/apps"),
        fetch("/api/categories/mappings"),
      ]);

      if (!appsRes.ok) throw new Error("Failed to load apps");
      if (!mappingsRes.ok) throw new Error("Failed to load mappings");

      const appsData = await appsRes.json();
      const mappingsData = await mappingsRes.json();

      setApps(appsData.apps);

      const map = new Map<string, string>();
      for (const m of mappingsData.mappings) {
        map.set(m.bundleId, m.categoryId);
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
  // Handle category change for an app
  // ---------------------------------------------------------------------------

  function handleCategoryChange(bundleId: string, categoryId: string) {
    setPendingChanges((prev) => {
      const next = new Map(prev);
      // If the new value matches the original mapping, remove from pending
      if (mappings.get(bundleId) === categoryId) {
        next.delete(bundleId);
      } else {
        next.set(bundleId, categoryId);
      }
      return next;
    });
  }

  // Get effective category for an app (pending change or existing mapping)
  function getEffectiveCategory(bundleId: string): string {
    return pendingChanges.get(bundleId) ?? mappings.get(bundleId) ?? "";
  }

  // ---------------------------------------------------------------------------
  // Save changes
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (pendingChanges.size === 0) return;
    setSaving(true);
    try {
      const mappingsToSave = Array.from(pendingChanges.entries()).map(
        ([bundleId, categoryId]) => ({ bundleId, categoryId }),
      );

      const res = await fetch("/api/categories/mappings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: mappingsToSave }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to save mappings");
      }

      // Apply pending changes to the mappings map
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
          <h2 className="text-lg font-semibold">App Mappings</h2>
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
        Assign each tracked app to a category. Changes are batched and saved
        together.
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
            here for categorization.
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
            {filteredApps.map((app) => (
              <AppMappingRow
                key={app.bundleId}
                app={app}
                categories={categories}
                selectedCategoryId={getEffectiveCategory(app.bundleId)}
                hasChange={pendingChanges.has(app.bundleId)}
                onCategoryChange={(catId) =>
                  handleCategoryChange(app.bundleId, catId)
                }
                formatDuration={formatDuration}
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
    </section>
  );
}

// =============================================================================
// App Mapping Row
// =============================================================================

function AppMappingRow({
  app,
  categories,
  selectedCategoryId,
  hasChange,
  onCategoryChange,
  formatDuration,
}: {
  app: TrackedApp;
  categories: Category[];
  selectedCategoryId: string;
  hasChange: boolean;
  onCategoryChange: (categoryId: string) => void;
  formatDuration: (seconds: number) => string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl p-3 transition-colors",
        hasChange ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-secondary",
      )}
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
      <div className="shrink-0 ml-3">
        <select
          value={selectedCategoryId}
          onChange={(e) => onCategoryChange(e.target.value)}
          className={cn(
            "h-8 rounded-lg border bg-background pl-2 pr-7 text-sm outline-none transition-colors",
            "focus:ring-2 focus:ring-ring focus:ring-offset-1",
            hasChange && "border-primary/40",
          )}
        >
          <option value="">Uncategorized</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.title}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// =============================================================================
// Category Row
// =============================================================================

function CategoryRow({
  category,
  onEdit,
  onDelete,
}: {
  category: Category;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-secondary p-4">
      <div className="flex items-center gap-3 min-w-0">
        <CategoryPill
          title={category.title}
          icon={category.icon}
          colorKey={category.slug}
        />
        {category.isDefault && (
          <span className="text-xs text-muted-foreground">Built-in</span>
        )}
      </div>
      {!category.isDefault && (
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
      )}
    </div>
  );
}

// =============================================================================
// Icon Picker
// =============================================================================

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (icon: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {AVAILABLE_ICONS.map((iconName) => {
        const IconComp = ICON_COMPONENTS[iconName] ?? Folder;
        const selected = value === iconName;
        return (
          <button
            key={iconName}
            type="button"
            onClick={() => onChange(iconName)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border transition-colors",
              selected
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
            title={iconName}
          >
            <IconComp className="size-4" strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
