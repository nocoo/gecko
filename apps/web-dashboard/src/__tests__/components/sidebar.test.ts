import { describe, expect, it } from "bun:test";
import {
  navSections,
  isActive,
  isExactActive,
  isParentActive,
} from "@/components/layout/sidebar";

describe("sidebar navigation", () => {
  describe("navSections", () => {
    it("has 2 sections", () => {
      expect(navSections).toHaveLength(2);
    });

    it("section 0 has Dashboard and Sessions", () => {
      expect(navSections[0]!.title).toBeNull();
      expect(navSections[0]!.items.map((i) => i.label)).toEqual([
        "Dashboard",
        "Sessions",
      ]);
    });

    it("section 1 has Settings", () => {
      expect(navSections[1]!.title).toBeNull();
      expect(navSections[1]!.items.map((i) => i.label)).toEqual(["Settings"]);
    });

    it("every item has an href, label, and icon", () => {
      for (const section of navSections) {
        for (const item of section.items) {
          expect(item.href).toBeTruthy();
          expect(item.label).toBeTruthy();
          expect(item.icon).toBeTruthy();
        }
      }
    });

    it("all top-level hrefs are unique", () => {
      const hrefs = navSections.flatMap((s) => s.items.map((i) => i.href));
      expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it("all hrefs start with /", () => {
      for (const section of navSections) {
        for (const item of section.items) {
          expect(item.href.startsWith("/")).toBe(true);
        }
      }
    });
  });

  describe("Settings children", () => {
    const settingsItem = navSections[1]!.items[0]!;

    it("Settings has children", () => {
      expect(settingsItem.children).toBeDefined();
      expect(settingsItem.children!.length).toBe(3);
    });

    it("children are General, Categories, Tags", () => {
      expect(settingsItem.children!.map((c) => c.label)).toEqual([
        "General",
        "Categories",
        "Tags",
      ]);
    });

    it("children have correct hrefs", () => {
      expect(settingsItem.children!.map((c) => c.href)).toEqual([
        "/settings",
        "/settings/categories",
        "/settings/tags",
      ]);
    });

    it("every child has an icon", () => {
      for (const child of settingsItem.children!) {
        expect(child.icon).toBeTruthy();
      }
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
  });

  describe("isExactActive", () => {
    it("returns true for exact match", () => {
      expect(isExactActive("/settings", "/settings")).toBe(true);
    });

    it("returns false for child path", () => {
      expect(isExactActive("/settings/categories", "/settings")).toBe(false);
    });

    it("returns false for parent path", () => {
      expect(isExactActive("/settings", "/settings/categories")).toBe(false);
    });
  });

  describe("isParentActive", () => {
    const settingsItem = navSections[1]!.items[0]!;

    it("returns true when on /settings", () => {
      expect(isParentActive("/settings", settingsItem)).toBe(true);
    });

    it("returns true when on a child route /settings/categories", () => {
      expect(isParentActive("/settings/categories", settingsItem)).toBe(true);
    });

    it("returns true when on a child route /settings/tags", () => {
      expect(isParentActive("/settings/tags", settingsItem)).toBe(true);
    });

    it("returns false when on unrelated route", () => {
      expect(isParentActive("/sessions", settingsItem)).toBe(false);
    });

    it("returns true for item without children when path matches", () => {
      const dashboardItem = navSections[0]!.items[0]!;
      expect(isParentActive("/", dashboardItem)).toBe(true);
    });

    it("returns false for item without children when path does not match", () => {
      const dashboardItem = navSections[0]!.items[0]!;
      expect(isParentActive("/settings", dashboardItem)).toBe(false);
    });
  });
});
