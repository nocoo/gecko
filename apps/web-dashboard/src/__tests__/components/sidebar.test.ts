import { describe, expect, it } from "bun:test";
import { navSections, isActive } from "@/components/layout/sidebar";

describe("sidebar navigation", () => {
  describe("navSections", () => {
    it("has 2 sections", () => {
      expect(navSections).toHaveLength(2);
    });

    it("section 0 has Dashboard", () => {
      expect(navSections[0]!.title).toBeNull();
      expect(navSections[0]!.items.map((i) => i.label)).toEqual(["Dashboard"]);
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

    it("all hrefs are unique", () => {
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
});
