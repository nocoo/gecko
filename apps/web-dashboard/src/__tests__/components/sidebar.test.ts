import { describe, expect, it } from "bun:test";
import {
  navGroups,
  allNavItems,
  isActive,
} from "@/components/layout/sidebar";

describe("sidebar navigation", () => {
  describe("navGroups", () => {
    it("has 4 groups", () => {
      expect(navGroups).toHaveLength(4);
    });

    it("group 0 is Overview with Dashboard, Sessions, Daily Review", () => {
      expect(navGroups[0]!.label).toBe("Overview");
      expect(navGroups[0]!.items.map((i) => i.label)).toEqual([
        "Dashboard",
        "Sessions",
        "Daily Review",
      ]);
    });

    it("group 1 is Data with Apps, Categories, Tags", () => {
      expect(navGroups[1]!.label).toBe("Data");
      expect(navGroups[1]!.items.map((i) => i.label)).toEqual([
        "Apps",
        "Categories",
        "Tags",
      ]);
    });

    it("group 2 is Integrations with API, Backy", () => {
      expect(navGroups[2]!.label).toBe("Integrations");
      expect(navGroups[2]!.items.map((i) => i.label)).toEqual([
        "API",
        "Backy",
      ]);
    });

    it("group 3 is Settings with General, AI Settings", () => {
      expect(navGroups[3]!.label).toBe("Settings");
      expect(navGroups[3]!.items.map((i) => i.label)).toEqual([
        "General",
        "AI Settings",
      ]);
    });

    it("every item has an href, label, and icon", () => {
      for (const group of navGroups) {
        for (const item of group.items) {
          expect(item.href).toBeTruthy();
          expect(item.label).toBeTruthy();
          expect(item.icon).toBeTruthy();
        }
      }
    });

    it("all hrefs across all groups are unique", () => {
      const hrefs = allNavItems.map((i) => i.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it("all hrefs start with /", () => {
      for (const item of allNavItems) {
        expect(item.href.startsWith("/")).toBe(true);
      }
    });

    it("all groups default to open", () => {
      for (const group of navGroups) {
        expect(group.defaultOpen).toBe(true);
      }
    });
  });

  describe("allNavItems", () => {
    it("flattens all group items", () => {
      const expected = navGroups.flatMap((g) => g.items);
      expect(allNavItems).toEqual(expected);
    });

    it("has 10 total items", () => {
      expect(allNavItems).toHaveLength(10);
    });
  });

  describe("isActive", () => {
    it("returns true for exact match on /", () => {
      expect(isActive("/", "/")).toBe(true);
    });

    it("returns false for non-root paths when href is /", () => {
      expect(isActive("/settings", "/")).toBe(false);
    });

    it("returns true for exact match on non-root paths", () => {
      expect(isActive("/settings", "/settings")).toBe(true);
    });

    it("returns true for child paths", () => {
      expect(isActive("/settings/account", "/settings")).toBe(true);
    });

    it("returns false for unrelated paths", () => {
      expect(isActive("/settings", "/dashboard")).toBe(false);
    });

    it("returns false for partial prefix matches that are not path segments", () => {
      expect(isActive("/settingsmore", "/settings")).toBe(false);
    });

    it("exact mode: returns true only for exact pathname match", () => {
      expect(isActive("/settings", "/settings", true)).toBe(true);
    });

    it("exact mode: returns false for child paths", () => {
      expect(isActive("/settings/tags", "/settings", true)).toBe(false);
      expect(isActive("/settings/categories", "/settings", true)).toBe(false);
    });

    it("exact mode on root: matches only /", () => {
      expect(isActive("/", "/", true)).toBe(true);
      expect(isActive("/anything", "/", true)).toBe(false);
    });

    it("handles deeply nested child paths", () => {
      expect(isActive("/settings/ai/models/gpt", "/settings")).toBe(true);
      expect(isActive("/integrations/api/keys", "/integrations/api")).toBe(true);
    });

    it("does not match sibling routes with shared prefix", () => {
      expect(isActive("/apps", "/apps")).toBe(true);
      expect(isActive("/apps-extra", "/apps")).toBe(false);
    });

    it("returns false for empty pathname", () => {
      expect(isActive("", "/settings")).toBe(false);
    });
  });

  describe("navGroups structure", () => {
    it("every group has a non-empty label", () => {
      for (const group of navGroups) {
        expect(group.label.length).toBeGreaterThan(0);
      }
    });

    it("every item has a unique label within its group", () => {
      for (const group of navGroups) {
        const labels = group.items.map((i) => i.label);
        expect(new Set(labels).size).toBe(labels.length);
      }
    });

    it("General settings uses exact matching", () => {
      const settingsGroup = navGroups.find((g) => g.label === "Settings")!;
      const general = settingsGroup.items.find((i) => i.label === "General")!;
      expect(general.exact).toBe(true);
    });

    it("non-exact items do not have exact flag", () => {
      const nonExactItems = allNavItems.filter((i) => !i.exact);
      for (const item of nonExactItems) {
        expect(item.exact).toBeUndefined();
      }
    });
  });
});
