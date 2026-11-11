"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@nocoo/basalt/components/avatar";
import {
  Sidebar as BasaltSidebar,
  SidebarBrand,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarIconItem,
  SidebarItem,
  SidebarNav,
  SidebarProvider,
  SidebarToggle,
  SidebarUser,
  useSidebar,
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
  Plug,
  SlidersHorizontal,
  Tags,
} from "lucide-react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import { useMe } from "@/hooks/use-me";
import { APP_VERSION } from "@/lib/version";

const ACCESS_LOGOUT_URL = "/cdn-cgi/access/logout";
const SIDEBAR_COLLAPSED_KEY = "gecko:sidebar-collapsed";
type SidebarCollapsedPreference = "false" | "true";

type IconComponent = React.ComponentType<React.SVGProps<SVGSVGElement> & { strokeWidth?: number }>;

interface NavItem {
  href: string;
  label: string;
  icon: IconComponent;
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

const allNavItems = navGroups.flatMap((g) => g.items);

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  if (href === "/" || exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function usePersistedSidebarCollapsed(
  key: string,
  defaultValue: SidebarCollapsedPreference,
): [SidebarCollapsedPreference, (value: SidebarCollapsedPreference) => void] {
  const [stored, setStored] = useState<SidebarCollapsedPreference>(() => {
    if (typeof window === "undefined") return defaultValue;
    const value = localStorage.getItem(key);
    return value === "true" || value === "false" ? value : defaultValue;
  });

  const setValue = useCallback(
    (next: SidebarCollapsedPreference) => {
      setStored(next);
      localStorage.setItem(key, next);
    },
    [key],
  );

  return [stored, setValue];
}

export function PersistedSidebarProvider({ children }: { children: ReactNode }) {
  const [stored, setStored] = usePersistedSidebarCollapsed(SIDEBAR_COLLAPSED_KEY, "false");
  const collapsed = stored === "true";
  const onCollapsedChange = useCallback(
    (next: boolean) => {
      setStored(next ? "true" : "false");
    },
    [setStored],
  );

  return (
    <SidebarProvider collapsed={collapsed} onCollapsedChange={onCollapsedChange} defaultWidth={260}>
      {children}
    </SidebarProvider>
  );
}

interface SidebarProps {
  ariaLabel: string;
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
  onDismiss?: () => void;
}

function GeckoSidebarBody({
  variant,
  onNavigate,
  onDismiss,
}: {
  variant?: SidebarProps["variant"];
  onNavigate?: () => void;
  onDismiss?: () => void;
}) {
  const pathname = usePathname();
  const { collapsed, peek, peeking } = useSidebar();
  const railCollapsed = collapsed && !(peek && peeking);
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
    <>
      <SidebarHeader>
        <SidebarBrand
          logo={<Image src="/logo-24.png" alt="Gecko" width={24} height={24} unoptimized />}
          name="Gecko"
          version={`v${APP_VERSION}`}
          action={
            variant === "mobile" ? (
              <SidebarToggle
                mode="dismiss"
                dismissLabel="Close navigation"
                {...(onDismiss ? { onDismiss } : {})}
              />
            ) : (
              <SidebarToggle expandLabel="Expand sidebar" collapseLabel="Collapse sidebar" />
            )
          }
        />
      </SidebarHeader>
      <SidebarNav aria-label="Main navigation">
        {railCollapsed
          ? allNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Tooltip key={item.href} delayDuration={0}>
                  <TooltipTrigger asChild>
                    <SidebarIconItem
                      href={item.href}
                      active={active}
                      aria-label={item.label}
                      onClick={onNavigate}
                    >
                      <Icon strokeWidth={1.5} aria-hidden="true" />
                    </SidebarIconItem>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>
                    {item.label}
                  </TooltipContent>
                </Tooltip>
              );
            })
          : navGroups.map((group) => (
              <SidebarGroup
                key={group.label}
                label={group.label}
                defaultOpen={group.defaultOpen ?? true}
              >
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(pathname, item.href, item.exact);
                  return (
                    <SidebarItem
                      key={item.href}
                      href={item.href}
                      active={active}
                      onClick={onNavigate}
                    >
                      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                      <span className="flex-1 truncate text-left">{item.label}</span>
                    </SidebarItem>
                  );
                })}
              </SidebarGroup>
            ))}
      </SidebarNav>
      <SidebarFooter>
        <SidebarUser
          name={userName}
          email={userEmail || undefined}
          avatar={avatar}
          tooltip={userName}
          signOutHref={ACCESS_LOGOUT_URL}
          signOutLabel="Sign out"
        />
      </SidebarFooter>
    </>
  );
}

export function Sidebar({ ariaLabel, variant = "desktop", onNavigate, onDismiss }: SidebarProps) {
  return (
    <TooltipProvider delayDuration={0}>
      <BasaltSidebar aria-label={ariaLabel} resizable={false}>
        <GeckoSidebarBody
          variant={variant}
          {...(onNavigate ? { onNavigate } : {})}
          {...(onDismiss ? { onDismiss } : {})}
        />
      </BasaltSidebar>
    </TooltipProvider>
  );
}

export type { NavGroup, NavItem };
export { allNavItems, isActive, navGroups };
