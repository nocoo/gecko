"use client";

import { getHashColor } from "@/lib/hash-color";
import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export interface TagBadgeProps
  extends Omit<ComponentProps<"span">, "children"> {
  /** Tag name to display */
  name: string;
  /** String to hash for color (defaults to name) */
  colorKey?: string;
  /** Size variant */
  size?: "sm" | "md";
}

/**
 * Colored pill displaying a tag with label only (no icon).
 * Color is computed from a stable hash of `colorKey` (or `name`).
 */
export function TagBadge({
  name,
  colorKey,
  size = "md",
  className,
  ...props
}: TagBadgeProps) {
  const { fg, bg } = getHashColor(colorKey ?? name);

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className,
      )}
      style={{ color: fg, backgroundColor: bg }}
      {...props}
    >
      {name}
    </span>
  );
}
