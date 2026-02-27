"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  List,
  Settings,
  PanelLeft,
  LogOut,
  SlidersHorizontal,
  Layers,
  Tags,
} from "lucide-react";
import { cn, getAvatarColor } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSidebar } from "./sidebar-context";

// =============================================================================
// Navigation structure
// =============================================================================

type IconComponent = React.ComponentType<
  React.SVGProps<SVGSVGElement> & { strokeWidth?: number }
>;

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
  /** Sub-navigation items. Shown when this item (or any child) is active. */
  children?: NavItem[];
}

interface NavSection {
  title: string | null;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: null,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/sessions", label: "Sessions", icon: List },
    ],
  },
  {
    title: null,
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        children: [
          { href: "/settings", label: "General", icon: SlidersHorizontal },
          {
            href: "/settings/categories",
            label: "Categories",
            icon: Layers,
          },
          { href: "/settings/tags", label: "Tags", icon: Tags },
        ],
      },
    ],
  },
];

/** Check if a nav item is currently active. */
function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Exact match — used for child items like /settings vs /settings/categories. */
function isExactActive(pathname: string, href: string): boolean {
  return pathname === href;
}

/** Check if a parent or any of its children matches the current path. */
function isParentActive(pathname: string, item: NavItem): boolean {
  if (isActive(pathname, item.href)) return true;
  return (
    item.children?.some(
      (child) =>
        isExactActive(pathname, child.href) || isActive(pathname, child.href),
    ) ?? false
  );
}

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
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden",
          collapsed ? "w-[68px]" : "w-[260px]",
        )}
      >
        {collapsed ? (
          /* ================================================================
           * Collapsed (icon-only) view
           * ================================================================ */
          <div className="flex h-screen w-[68px] flex-col items-center">
            {/* Logo */}
            <div className="flex h-14 w-full items-center justify-start pl-[18px] pr-3">
              <img
                src="/logo-sidebar.png"
                alt="Gecko"
                width={32}
                height={32}
                className="shrink-0"
              />
            </div>

            {/* Expand toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={toggle}
                  aria-label="Expand sidebar"
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
                >
                  <PanelLeft
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                Expand sidebar
              </TooltipContent>
            </Tooltip>

            {/* Navigation — collapsed: flat icon list with separators */}
            <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
              {navSections.map((section, sIdx) => (
                <div key={sIdx} className="flex flex-col items-center gap-1">
                  {sIdx > 0 && (
                    <div className="my-1 h-px w-6 bg-border" />
                  )}
                  {section.items.map((item) => {
                    const active = isParentActive(pathname, item);
                    return (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>
                          <Link
                            href={item.href}
                            className={cn(
                              "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                              active
                                ? "bg-accent text-foreground"
                                : "text-muted-foreground hover:bg-accent hover:text-foreground",
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
                </div>
              ))}
            </nav>

            {/* User avatar + sign out */}
            <div className="py-3 flex justify-center w-full">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="cursor-pointer"
                  >
                    <Avatar className="h-9 w-9">
                      {userImage && (
                        <AvatarImage src={userImage} alt={userName} />
                      )}
                      <AvatarFallback
                        className={cn(
                          "text-xs text-white",
                          getAvatarColor(userName),
                        )}
                      >
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
          <div className="flex h-screen w-[260px] flex-col">
            {/* Header: logo + collapse toggle */}
            <div className="px-3 h-14 flex items-center">
              <div className="flex w-full items-center justify-between px-3">
                <div className="flex items-center gap-3">
                  <img
                    src="/logo-sidebar.png"
                    alt="Gecko"
                    width={32}
                    height={32}
                    className="shrink-0"
                  />
                  <span className="text-lg font-bold tracking-tight">
                    Gecko
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                  >
                    v{APP_VERSION}
                  </Badge>
                </div>
                <button
                  onClick={toggle}
                  aria-label="Collapse sidebar"
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
                >
                  <PanelLeft
                    className="h-4 w-4"
                    aria-hidden="true"
                    strokeWidth={1.5}
                  />
                </button>
              </div>
            </div>

            {/* Navigation — expanded: grouped sections */}
            <nav className="flex-1 overflow-y-auto pt-1">
              <div className="flex flex-col gap-0.5 px-3">
                {navSections.map((section, sIdx) => (
                  <div key={sIdx}>
                    {sIdx > 0 && (
                      <div className="my-2 h-px bg-border mx-1" />
                    )}
                    {section.title && (
                      <div className="px-3 pb-1 pt-2">
                        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
                          {section.title}
                        </span>
                      </div>
                    )}
                    {section.items.map((item) => {
                      const parentActive = isParentActive(pathname, item);
                      const hasChildren =
                        item.children && item.children.length > 0;

                      return (
                        <div key={item.href}>
                          {/* Parent item */}
                          <Link
                            href={item.href}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                              parentActive && !hasChildren
                                ? "bg-accent text-foreground"
                                : parentActive && hasChildren
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
                            )}
                          >
                            <item.icon
                              className="h-4 w-4 shrink-0"
                              strokeWidth={1.5}
                            />
                            <span className="flex-1 text-left">
                              {item.label}
                            </span>
                          </Link>

                          {/* Children — shown when parent is active */}
                          {hasChildren && parentActive && (
                            <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-border pl-3">
                              {item.children!.map((child) => {
                                // For /settings (General), use exact match
                                // For /settings/categories, /settings/tags, use prefix match
                                const childActive =
                                  child.href === "/settings"
                                    ? isExactActive(pathname, child.href)
                                    : isActive(pathname, child.href);
                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    className={cn(
                                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-normal transition-colors",
                                      childActive
                                        ? "bg-accent text-foreground"
                                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                                    )}
                                  >
                                    <child.icon
                                      className="h-3.5 w-3.5 shrink-0"
                                      strokeWidth={1.5}
                                    />
                                    <span className="flex-1 text-left">
                                      {child.label}
                                    </span>
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </nav>

            {/* User info + sign out */}
            <div className="px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-9 w-9 shrink-0">
                  {userImage && (
                    <AvatarImage src={userImage} alt={userName} />
                  )}
                  <AvatarFallback
                    className={cn(
                      "text-xs text-white",
                      getAvatarColor(userName),
                    )}
                  >
                    {userInitial}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {userName}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {userEmail}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => signOut({ callbackUrl: "/login" })}
                      aria-label="Sign out"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                    >
                      <LogOut
                        className="h-4 w-4"
                        aria-hidden="true"
                        strokeWidth={1.5}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Sign out</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

// Export for testing
export { navSections, isActive, isExactActive, isParentActive };
export type { NavItem, NavSection };
