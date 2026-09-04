"use client";

import { AppHeader } from "@nocoo/basalt/components/app-header";
import {
  AppMain,
  AppSkipLink,
  AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import { ContentIsland } from "@nocoo/basalt/components/sidebar";
import { Menu } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Github } from "@/components/icons/github";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

function AppShellInner({ children, breadcrumbs = [] }: AppShellProps) {
  const isMobile = useIsMobile();
  const { mobileOpen, setMobileOpen } = useSidebar();
  const pathname = usePathname();

  // Close mobile sidebar on route change. Reference pathname in the body so
  // Biome useExhaustiveDependencies keeps it as a real dependency (setMobileOpen
  // alone is stable and would never re-run after navigation).
  useEffect(() => {
    void pathname;
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const allBreadcrumbs = [{ label: "Home", href: "/" }, ...breadcrumbs];

  return (
    <BasaltAppShell>
      <AppSkipLink href="#main-content">Skip to content</AppSkipLink>

      {/* Desktop sidebar */}
      {!isMobile && <Sidebar />}

      {/* Mobile overlay */}
      {isMobile && mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-zinc-950/50 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[var(--sidebar-width)]">
            <Sidebar />
          </div>
        </>
      )}

      <AppMain>
        {/* Header */}
        <AppHeader
          leading={
            isMobile ? (
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                aria-label="Open navigation menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-basalt-muted-foreground hover:text-basalt-foreground hover:bg-basalt-accent transition-colors cursor-pointer"
              >
                <Menu className="h-5 w-5" aria-hidden="true" strokeWidth={1.5} />
              </button>
            ) : undefined
          }
          breadcrumbs={allBreadcrumbs}
          actions={
            <>
              <a
                href="https://github.com/nocoo/gecko"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub repository"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-basalt-muted-foreground hover:text-basalt-foreground hover:bg-basalt-accent transition-colors"
              >
                <Github className="h-[18px] w-[18px]" aria-hidden="true" strokeWidth={1.5} />
              </a>
              <ThemeToggle aria-label="Toggle theme" />
            </>
          }
        />

        {/* Floating island content area */}
        <div className="flex-1 px-2 pb-2 md:px-3 md:pb-3 overflow-hidden flex flex-col">
          <ContentIsland>{children}</ContentIsland>
        </div>
      </AppMain>
    </BasaltAppShell>
  );
}

export function AppShell({ children, breadcrumbs = [] }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellInner breadcrumbs={breadcrumbs}>{children}</AppShellInner>
    </SidebarProvider>
  );
}
