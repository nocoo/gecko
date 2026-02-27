"use client";

import {
  Cpu,
  Monitor,
  Globe,
  AppWindow,
  Folder,
  type LucideProps,
} from "lucide-react";
import { getHashColor } from "@/lib/hash-color";
import { cn } from "@/lib/utils";
import type { ComponentProps, FC } from "react";

/**
 * Static icon map for category icons.
 * Add new entries here when new icon options are introduced.
 * Using a static map avoids dynamic imports and works with RSC.
 */
const ICON_MAP: Record<string, FC<LucideProps>> = {
  cpu: Cpu,
  monitor: Monitor,
  globe: Globe,
  "app-window": AppWindow,
  folder: Folder,
};

/** Default fallback icon when the icon name is not found in the map. */
const DEFAULT_ICON = Folder;

export interface CategoryPillProps
  extends Omit<ComponentProps<"span">, "children"> {
  /** Category title to display */
  title: string;
  /** Lucide icon name (e.g. 'monitor', 'globe') */
  icon: string;
  /** String to hash for color (defaults to title) */
  colorKey?: string;
  /** Size variant */
  size?: "sm" | "md";
}

/**
 * Colored pill displaying a category with icon + label.
 * Color is computed from a stable hash of `colorKey` (or `title`).
 */
export function CategoryPill({
  title,
  icon,
  colorKey,
  size = "md",
  className,
  ...props
}: CategoryPillProps) {
  const { fg, bg } = getHashColor(colorKey ?? title);
  const IconComponent = ICON_MAP[icon] ?? DEFAULT_ICON;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className,
      )}
      style={{ color: fg, backgroundColor: bg }}
      {...props}
    >
      <IconComponent
        className={size === "sm" ? "size-3" : "size-3.5"}
        strokeWidth={2}
      />
      {title}
    </span>
  );
}

/** Available icon names for the category icon picker UI. */
export const AVAILABLE_ICONS = Object.keys(ICON_MAP);
