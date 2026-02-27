import { describe, test, expect } from "bun:test";
import {
  DEFAULT_CATEGORIES,
  BUNDLE_ID_MAPPINGS,
  type DefaultCategoryDef,
} from "../../lib/default-categories";

describe("default-categories constants", () => {
  test("has exactly 4 default categories", () => {
    expect(DEFAULT_CATEGORIES).toHaveLength(4);
  });

  test("default category slugs are unique", () => {
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  test("all default categories have required fields", () => {
    for (const cat of DEFAULT_CATEGORIES) {
      expect(cat.slug).toBeTruthy();
      expect(cat.title).toBeTruthy();
      expect(cat.icon).toBeTruthy();
    }
  });

  test("expected slugs are present", () => {
    const slugs = DEFAULT_CATEGORIES.map((c) => c.slug);
    expect(slugs).toContain("system-core");
    expect(slugs).toContain("system-app");
    expect(slugs).toContain("browser");
    expect(slugs).toContain("application");
  });

  test("all bundle_id mappings point to valid category slugs", () => {
    const validSlugs = new Set(DEFAULT_CATEGORIES.map((c) => c.slug));
    for (const [bundleId, slug] of BUNDLE_ID_MAPPINGS) {
      expect(validSlugs.has(slug)).toBe(true);
    }
  });

  test("bundle_id mappings include common browsers", () => {
    expect(BUNDLE_ID_MAPPINGS.get("com.google.Chrome")).toBe("browser");
    expect(BUNDLE_ID_MAPPINGS.get("com.apple.Safari")).toBe("browser");
    expect(BUNDLE_ID_MAPPINGS.get("org.mozilla.firefox")).toBe("browser");
    expect(BUNDLE_ID_MAPPINGS.get("company.thebrowser.Browser")).toBe("browser");
  });

  test("bundle_id mappings include common system apps", () => {
    expect(BUNDLE_ID_MAPPINGS.get("com.apple.finder")).toBe("system-app");
    expect(BUNDLE_ID_MAPPINGS.get("com.apple.ActivityMonitor")).toBe("system-app");
    expect(BUNDLE_ID_MAPPINGS.get("com.apple.Terminal")).toBe("system-app");
  });

  test("bundle_id mappings include system core processes", () => {
    expect(BUNDLE_ID_MAPPINGS.get("com.apple.loginwindow")).toBe("system-core");
    expect(BUNDLE_ID_MAPPINGS.get("com.apple.WindowServer")).toBe("system-core");
    expect(BUNDLE_ID_MAPPINGS.get("com.apple.dock")).toBe("system-core");
  });

  test("bundle_id mappings include common applications", () => {
    expect(BUNDLE_ID_MAPPINGS.get("com.microsoft.VSCode")).toBe("application");
    expect(BUNDLE_ID_MAPPINGS.get("com.tinyspeck.slackmacgap")).toBe("application");
    expect(BUNDLE_ID_MAPPINGS.get("com.spotify.client")).toBe("application");
  });

  test("has reasonable number of bundle_id mappings", () => {
    // Should have a decent set of known apps
    expect(BUNDLE_ID_MAPPINGS.size).toBeGreaterThan(30);
    // But not so many that seeding becomes slow
    expect(BUNDLE_ID_MAPPINGS.size).toBeLessThan(200);
  });

  test("all bundle_ids look like reverse-domain identifiers", () => {
    for (const [bundleId] of BUNDLE_ID_MAPPINGS) {
      // Should contain at least one dot
      expect(bundleId).toContain(".");
      // Should not start or end with a dot
      expect(bundleId.startsWith(".")).toBe(false);
      expect(bundleId.endsWith(".")).toBe(false);
    }
  });

  test("icons use known icon map names", () => {
    const knownIcons = new Set(["cpu", "monitor", "globe", "app-window", "folder"]);
    for (const cat of DEFAULT_CATEGORIES) {
      expect(knownIcons.has(cat.icon)).toBe(true);
    }
  });
});
