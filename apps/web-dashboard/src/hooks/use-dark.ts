import { useSyncExternalStore } from "react";

/**
 * Reactive hook that returns `true` when dark mode is active.
 *
 * Listens to:
 * - The custom "theme-change" event dispatched by ThemeToggle
 * - The system "prefers-color-scheme" media query
 *
 * This ensures the hook updates whenever the user toggles the theme or
 * the OS-level preference changes.
 */

function subscribe(callback: () => void) {
  // Re-check when the theme changes (storage event from basalt ThemeProvider or custom event)
  window.addEventListener("storage", callback);
  window.addEventListener("theme-change", callback);

  // Re-check when the OS dark-mode preference changes
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", callback);

  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("theme-change", callback);
    mq.removeEventListener("change", callback);
  };
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
