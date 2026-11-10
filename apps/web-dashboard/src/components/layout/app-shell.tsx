"use client";

import { AppHeader } from "@nocoo/basalt/components/app-header";
import {
  AppMain,
  AppSkipLink,
  AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import { Button } from "@nocoo/basalt/components/button";
import {
  SidebarProvider as BasaltSidebarProvider,
  ContentIsland,
} from "@nocoo/basalt/components/sidebar";
import { TooltipProvider } from "@nocoo/basalt/components/tooltip";
import { LinkProvider } from "@nocoo/basalt/providers/link";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { getPageBreadcrumbs } from "@/lib/page-navigation";
import { GitHubLink, HexlyLink } from "./header-links";
import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
  children: React.ReactNode;
}

function NextLinkAdapter({
  href,
  className,
  children,
  ...props
}: {
  href: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link href={href} className={className} {...props}>
      {children}
    </Link>
  );
}

function AppShellInner({ children }: AppShellProps) {
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

  const allBreadcrumbs = [{ label: "Home", href: "/" }, ...getPageBreadcrumbs(pathname)];
  const breadcrumbs = isMobile ? allBreadcrumbs.slice(-1) : allBreadcrumbs;

  return (
    <TooltipProvider delayDuration={0}>
      <LinkProvider render={NextLinkAdapter}>
        <BasaltAppShell>
          <AppSkipLink href="#main-content">Skip to content</AppSkipLink>

          {/* Desktop sidebar */}
          {!isMobile && <Sidebar />}

          {/* Mobile overlay */}
          {isMobile && (
            <BasaltSidebarProvider
              overlay
              collapsed={!mobileOpen}
              onCollapsedChange={(collapsed) => setMobileOpen(!collapsed)}
            >
              <Sidebar mobile />
            </BasaltSidebarProvider>
          )}

          <AppMain>
            {/* Header */}
            <AppHeader
              leading={
                isMobile ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Open navigation menu"
                    aria-haspopup="dialog"
                    aria-expanded={mobileOpen}
                    aria-controls={mobileOpen ? "mobile-navigation" : undefined}
                    onClick={(event) => {
                      event.currentTarget.focus();
                      setMobileOpen(true);
                    }}
                  >
                    <Menu aria-hidden="true" strokeWidth={1.5} />
                  </Button>
                ) : undefined
              }
              breadcrumbs={breadcrumbs}
              actions={
                <>
                  <GitHubLink />
                  <HexlyLink />
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
      </LinkProvider>
    </TooltipProvider>
  );
}

export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellInner>{children}</AppShellInner>
    </SidebarProvider>
  );
}
