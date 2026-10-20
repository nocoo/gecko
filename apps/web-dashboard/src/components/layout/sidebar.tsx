"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@nocoo/basalt/components/avatar";
import { Badge } from "@nocoo/basalt/components/badge";
import { EditableNavItem } from "@nocoo/basalt/components/editable-nav-item";
import {
  Sidebar as BasaltSidebar,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarNav,
  SidebarUser,
} from "@nocoo/basalt/components/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@nocoo/basalt/components/tooltip";
import {
  AppWindow,
  Bot,
  CalendarDays,
  HardDriveUpload,
  Layers,
  LayoutDashboard,
  List,
  LogOut,
  PanelLeft,
  Plug,
  SlidersHorizontal,
  Tags,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { accessLogout, useMe } from "@/hooks/use-me";
import { APP_VERSION } from "@/lib/version";
import { useSidebar } from "./sidebar-context";

// =============================================================================
// Navigation structure — flat groups with labels (basalt pattern)
// =============================================================================

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
  /** When true, only exact pathname match counts as active (no prefix matching). */
  exact?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    defaultOpen: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/sessions", label: "Sessions", icon: List },
      { href: "/daily", label: "Daily Review", icon: CalendarDays },
    ],
  },
  {
    label: "Data",
    defaultOpen: true,
    items: [
      { href: "/apps", label: "Apps", icon: AppWindow },
      { href: "/settings/categories", label: "Categories", icon: Layers },
      { href: "/settings/tags", label: "Tags", icon: Tags },
    ],
  },
  {
    label: "Integrations",
    defaultOpen: true,
    items: [
      { href: "/integrations/api", label: "API", icon: Plug },
      { href: "/settings/backy", label: "Backy", icon: HardDriveUpload },
    ],
  },
  {
    label: "Settings",
    defaultOpen: true,
    items: [
      { href: "/settings", label: "General", icon: SlidersHorizontal, exact: true },
      { href: "/settings/ai", label: "AI Settings", icon: Bot },
    ],
  },
];

/** All items flattened — used for collapsed icon-only view. */
const allNavItems = navGroups.flatMap((g) => g.items);

/** Check if a nav item is currently active. */
function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

// =============================================================================
// Main sidebar
// =============================================================================

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const { collapsed: desktopCollapsed, toggle } = useSidebar();
  const collapsed = !mobile && desktopCollapsed;
  const { user } = useMe();
  const userName = user?.name ?? "User";
  const userEmail = user?.email ?? "";
  const avatar = (
    <Avatar>
      {user?.avatar && <AvatarImage src={user.avatar} alt={userName} />}
      <AvatarFallback>{userName[0] ?? "?"}</AvatarFallback>
    </Avatar>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <BasaltSidebar
        collapsed={collapsed}
        id={mobile ? "mobile-navigation" : undefined}
        aria-label={mobile ? "Navigation" : undefined}
      >
        <SidebarHeader>
          <div className="flex w-[calc(var(--basalt-size-rail)-2*var(--basalt-space-nav-inset))] shrink-0 justify-center">
            <Image src="/logo-24.png" alt="Gecko" width={24} height={24} unoptimized />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 items-center gap-basalt-row-gap">
              <span className="font-semibold text-basalt-foreground">Gecko</span>
              <Badge variant="secondary">v{APP_VERSION}</Badge>
              {!mobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggle}
                  aria-label="Collapse sidebar"
                  className="ml-auto"
                >
                  <PanelLeft strokeWidth={1.5} />
                </Button>
              )}
            </div>
          )}
        </SidebarHeader>
        <SidebarNav aria-label="Main navigation">
          {collapsed ? (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggle}
                    aria-label="Expand sidebar"
                    className="mx-auto"
                  >
                    <PanelLeft strokeWidth={1.5} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
              {allNavItems.map((item) => (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="basalt-nav-item"
                      data-basalt-hover-item=""
                      data-hover-selected={isActive(pathname, item.href, item.exact)}
                    >
                      <Link
                        href={item.href}
                        aria-label={item.label}
                        aria-current={
                          isActive(pathname, item.href, item.exact) ? "page" : undefined
                        }
                      >
                        <item.icon strokeWidth={1.5} aria-hidden="true" />
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ))}
            </>
          ) : (
            navGroups.map((group) => (
              <SidebarGroup
                key={group.label}
                label={group.label}
                defaultOpen={group.defaultOpen ?? true}
              >
                {group.items.map((item) => (
                  <EditableNavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    selected={isActive(pathname, item.href, item.exact)}
                    icon={<item.icon strokeWidth={1.5} />}
                  />
                ))}
              </SidebarGroup>
            ))
          )}
        </SidebarNav>
        <SidebarFooter>
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={accessLogout}
                  aria-label={`${userName} - Sign out`}
                >
                  <LogOut strokeWidth={1.5} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{userName} - Sign out</TooltipContent>
            </Tooltip>
          ) : (
            <SidebarUser
              name={userName}
              email={userEmail}
              avatar={avatar}
              action={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={accessLogout}
                      aria-label="Sign out"
                    >
                      <LogOut strokeWidth={1.5} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Sign out</TooltipContent>
                </Tooltip>
              }
            />
          )}
        </SidebarFooter>
      </BasaltSidebar>
    </TooltipProvider>
  );
}

export type { NavGroup, NavItem };
// Export for testing
export { allNavItems, isActive, navGroups };
