"use client";

import { AppHeader, AppHeaderMenuButton, ProjectLinks } from "@nocoo/basalt/components/app-header";
import {
  AppMain,
  AppSkipLink,
  AppShell as BasaltAppShell,
} from "@nocoo/basalt/components/app-shell";
import { ContentIsland, SidebarDrawer } from "@nocoo/basalt/components/sidebar";
import { TooltipProvider } from "@nocoo/basalt/components/tooltip";
import { LinkProvider } from "@nocoo/basalt/providers/link";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { getPageBreadcrumbs } from "@/lib/page-navigation";
import { MobileNavProvider, useMobileNav } from "./mobile-nav-context";
import { PersistedSidebarProvider, Sidebar } from "./sidebar";
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
  const { mobileOpen, setMobileOpen } = useMobileNav();
  const pathname = usePathname();
  const menuButton = useRef<HTMLButtonElement>(null);

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

          {!isMobile && (
            <PersistedSidebarProvider>
              <Sidebar ariaLabel="Main navigation" />
            </PersistedSidebarProvider>
          )}

          {isMobile && (
            <SidebarDrawer
              id="mobile-navigation-drawer"
              open={mobileOpen}
              onOpenChange={setMobileOpen}
              returnFocusRef={menuButton}
              title="Navigation"
              description="Browse Gecko dashboard pages"
            >
              <Sidebar
                ariaLabel="Navigation"
                variant="mobile"
                onNavigate={() => setMobileOpen(false)}
                onDismiss={() => setMobileOpen(false)}
              />
            </SidebarDrawer>
          )}

          <AppMain>
            <AppHeader
              leading={
                isMobile ? (
                  <AppHeaderMenuButton
                    ref={menuButton}
                    label="Open navigation menu"
                    aria-expanded={mobileOpen}
                    aria-haspopup="dialog"
                    aria-controls={mobileOpen ? "mobile-navigation-drawer" : undefined}
                    onClick={() => {
                      menuButton.current?.focus();
                      setMobileOpen(true);
                    }}
                  />
                ) : undefined
              }
              breadcrumbs={breadcrumbs}
              breadcrumbsLabel="Breadcrumb"
              actions={
                <>
                  <ProjectLinks github="nocoo/gecko" hexly="gecko" name="Gecko" />
                  <ThemeToggle aria-label="Toggle theme" />
                </>
              }
            />

            <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 md:px-3 md:pb-3 overflow-hidden">
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
    <MobileNavProvider>
      <AppShellInner>{children}</AppShellInner>
    </MobileNavProvider>
  );
}
