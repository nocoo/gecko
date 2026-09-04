"use client";

import { ThemeToggle as BasaltThemeToggle } from "@nocoo/basalt/components/theme-toggle";
import type { ComponentProps } from "react";

export type { BasaltTheme as Theme } from "@nocoo/basalt/providers/theme";

export function ThemeToggle({
  "aria-label": ariaLabel = "Toggle theme",
  ...props
}: Partial<ComponentProps<typeof BasaltThemeToggle>>) {
  return <BasaltThemeToggle aria-label={ariaLabel} {...props} />;
}
