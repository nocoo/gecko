type Breadcrumb = { label: string; href?: string };

const pageBreadcrumbs: Record<string, Breadcrumb[]> = {
  "/sessions": [{ label: "Sessions" }],
  "/daily": [{ label: "Daily Review" }],
  "/apps": [{ label: "Apps" }],
  "/settings": [{ label: "Settings" }],
  "/settings/categories": [{ label: "Settings", href: "/settings" }, { label: "Categories" }],
  "/settings/tags": [{ label: "Settings", href: "/settings" }, { label: "Tags" }],
  "/settings/ai": [{ label: "Settings", href: "/settings" }, { label: "AI Settings" }],
  "/settings/backy": [{ label: "Integrations" }, { label: "Backy" }],
  "/integrations/api": [{ label: "Integrations" }, { label: "API" }],
};

export function formatDateDisplay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function getPageBreadcrumbs(pathname: string): Breadcrumb[] {
  const date = /^\/daily\/(\d{4}-\d{2}-\d{2})$/.exec(pathname)?.[1];
  return date
    ? [{ label: "Daily Review", href: "/daily" }, { label: formatDateDisplay(date) }]
    : (pageBreadcrumbs[pathname] ?? []);
}
