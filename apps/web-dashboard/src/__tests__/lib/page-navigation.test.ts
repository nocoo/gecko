import { describe, expect, test } from "vitest";
import { formatDateDisplay, getPageBreadcrumbs } from "@/lib/page-navigation";

describe("page breadcrumbs", () => {
  test.each([
    ["/", []],
    ["/sessions", [{ label: "Sessions" }]],
    ["/daily", [{ label: "Daily Review" }]],
    ["/apps", [{ label: "Apps" }]],
    ["/settings", [{ label: "Settings" }]],
    ["/settings/categories", [{ label: "Settings", href: "/settings" }, { label: "Categories" }]],
    ["/settings/tags", [{ label: "Settings", href: "/settings" }, { label: "Tags" }]],
    ["/settings/ai", [{ label: "Settings", href: "/settings" }, { label: "AI Settings" }]],
    ["/settings/backy", [{ label: "Integrations" }, { label: "Backy" }]],
    ["/integrations/api", [{ label: "Integrations" }, { label: "API" }]],
    ["/unknown", []],
    ["/daily/2026-10-17/nested", []],
  ] as const)("maps %s to its page hierarchy", (pathname, expected) => {
    expect(getPageBreadcrumbs(pathname)).toEqual(expected);
  });

  test("updates the dated review breadcrumb without a page-owned shell", () => {
    expect(getPageBreadcrumbs("/daily/2026-10-17")).toEqual([
      { label: "Daily Review", href: "/daily" },
      { label: "Sat, Oct 17, 2026" },
    ]);
    expect(getPageBreadcrumbs("/daily/2026-10-18")).toEqual([
      { label: "Daily Review", href: "/daily" },
      { label: "Sun, Oct 18, 2026" },
    ]);
  });
});

test("review dates use the same UTC calendar day at year and leap-day boundaries", () => {
  expect(formatDateDisplay("2026-01-01")).toBe("Thu, Jan 1, 2026");
  expect(formatDateDisplay("2024-02-29")).toBe("Thu, Feb 29, 2024");
});
