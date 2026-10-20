"use client";

import { AppHeader } from "@nocoo/basalt/components/app-header";
import {
  AppMain,
  AppSkipLink,
  AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import {
  SidebarProvider as BasaltSidebarProvider,
  ContentIsland,
} from "@nocoo/basalt/components/sidebar";
import { LinkProvider } from "@nocoo/basalt/providers/link";
import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Github } from "@/components/icons/github";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { Breadcrumbs } from "./breadcrumbs";
import { HeaderTooltip, HexlyLink } from "./header-links";
import { Sidebar } from "./sidebar";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { ThemeToggle } from "./theme-toggle";

interface AppShellProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
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

  // Render breadcrumbs into AppHeader leading area using Breadcrumbs component directly,
  // rather than passing title to AppHeader (which renders an <h1> and conflicts with page headings).
  const allBreadcrumbs = [{ label: "Home", href: "/" }, ...breadcrumbs];

  return (
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
              <div className="flex items-center gap-3">
                {isMobile && (
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
                )}
                <Breadcrumbs items={isMobile ? allBreadcrumbs.slice(-1) : allBreadcrumbs} />
              </div>
            }
            actions={
              <>
                <HeaderTooltip label="GitHub repository">
                  <Button asChild variant="ghost" size="icon">
                    <a
                      href="https://github.com/nocoo/gecko"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="GitHub repository"
                    >
                      <Github aria-hidden="true" strokeWidth={1.5} />
                    </a>
                  </Button>
                </HeaderTooltip>
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
  );
}

export function AppShell({ children, breadcrumbs = [] }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppShellInner breadcrumbs={breadcrumbs}>{children}</AppShellInner>
    </SidebarProvider>
  );
}
