"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@nocoo/basalt/components/avatar";
import { Badge } from "@nocoo/basalt/components/badge";
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
import { signOut, useSession } from "next-auth/react";
import { cn, getAvatarColor } from "@/lib/utils";
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

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { data: session } = useSession();

  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";
  const userImage = session?.user?.image;
  const userInitial = userName[0] ?? "?";

  return (
    <TooltipProvider delayDuration={0}>
      <BasaltSidebar collapsed={collapsed} className="transition-all duration-300 ease-in-out">
        {collapsed ? (
          /* ================================================================
           * Collapsed (icon-only) view
           * ================================================================ */
          <div className="flex h-screen w-full flex-col items-center">
            {/* Logo */}
            <div className="flex h-14 w-full items-center justify-start pl-6 pr-3">
              <Image
                src="/logo-24.png"
                alt="Gecko"
                width={24}
                height={24}
                unoptimized
                className="shrink-0"
              />
            </div>

            {/* Expand toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Expand sidebar"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-basalt-muted-foreground hover:text-basalt-foreground hover:bg-basalt-accent transition-colors mb-2 cursor-pointer"
                >
                  <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            </Tooltip>

            {/* Navigation — collapsed: flat icon list, no separators */}
            <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
              {allNavItems.map((item) => {
                const active = isActive(pathname, item.href, item.exact);
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                          active
                            ? "bg-basalt-accent text-basalt-foreground"
                            : "text-basalt-muted-foreground hover:bg-basalt-accent hover:text-basalt-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" strokeWidth={1.5} />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </nav>

            {/* User avatar + sign out */}
            <div className="py-3 flex justify-center w-full">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="cursor-pointer"
                  >
                    <Avatar className="h-9 w-9">
                      {userImage && <AvatarImage src={userImage} alt={userName} />}
                      <AvatarFallback className={`text-xs text-white ${getAvatarColor(userName)}`}>
                        {userInitial}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {userName} — Sign out
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        ) : (
          /* ================================================================
           * Expanded view
           * ================================================================ */
          <div className="flex h-screen w-full flex-col">
            {/* Header: logo + collapse toggle */}
            <SidebarHeader>
              <div className="flex w-full items-center justify-between">
                <div className="flex items-center gap-3">
                  <Image
                    src="/logo-24.png"
                    alt="Gecko"
                    width={24}
                    height={24}
                    unoptimized
                    className="shrink-0"
                  />
                  <span className="text-lg font-bold tracking-tighter text-basalt-foreground">
                    Gecko
                  </span>
                  <Badge variant="secondary" className="px-1.5 py-0.5 text-[10px] leading-none">
                    v{APP_VERSION}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={toggle}
                  aria-label="Collapse sidebar"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-basalt-muted-foreground hover:text-basalt-foreground transition-colors cursor-pointer"
                >
                  <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                </button>
              </div>
            </SidebarHeader>

            {/* Navigation — expanded: collapsible groups with labels */}
            <SidebarNav>
              {navGroups.map((group) => (
                <SidebarGroup
                  key={group.label}
                  label={group.label}
                  defaultOpen={group.defaultOpen ?? true}
                >
                  {group.items.map((item) => {
                    const active = isActive(pathname, item.href, item.exact);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                          active
                            ? "bg-basalt-accent text-basalt-foreground"
                            : "text-basalt-muted-foreground hover:bg-basalt-accent hover:text-basalt-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                        <span className="flex-1 text-left">{item.label}</span>
                      </Link>
                    );
                  })}
                </SidebarGroup>
              ))}
            </SidebarNav>

            {/* User info + sign out */}
            <SidebarFooter>
              <SidebarUser
                name={userName}
                email={userEmail}
                avatar={
                  <Avatar className="h-9 w-9 shrink-0">
                    {userImage && <AvatarImage src={userImage} alt={userName} />}
                    <AvatarFallback className={`text-xs text-white ${getAvatarColor(userName)}`}>
                      {userInitial}
                    </AvatarFallback>
                  </Avatar>
                }
                action={
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        aria-label="Sign out"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-basalt-muted-foreground hover:text-basalt-foreground hover:bg-basalt-accent transition-colors shrink-0 cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">Sign out</TooltipContent>
                  </Tooltip>
                }
              />
            </SidebarFooter>
          </div>
        )}
      </BasaltSidebar>
    </TooltipProvider>
  );
}

export type { NavGroup, NavItem };
// Export for testing
export { allNavItems, isActive, navGroups };
