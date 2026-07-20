import { describe, expect, test } from "vitest";

// ---------------------------------------------------------------------------
// Settings page unit tests
//
// We test the formatDate helper used in the Settings page.
// API key management has moved to the Integrations > API page and is
// tested in __tests__/api/keys.test.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// formatDate helper (extracted for testing)
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

describe("Settings page helpers", () => {
  describe("formatDate", () => {
    test("returns 'today' for current date", () => {
      expect(formatDate(new Date().toISOString())).toBe("today");
    });

    test("returns 'yesterday' for 1 day ago", () => {
      const yesterday = new Date(Date.now() - 86400 * 1000);
      expect(formatDate(yesterday.toISOString())).toBe("yesterday");
    });

    test("returns 'N days ago' for 2-6 days", () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
      expect(formatDate(threeDaysAgo.toISOString())).toBe("3 days ago");
    });

    test("returns formatted date for older dates", () => {
      const result = formatDate("2025-01-15T12:00:00Z");
      expect(result).toContain("Jan");
      expect(result).toContain("15");
    });

    test("includes year for dates in different year", () => {
      const result = formatDate("2024-06-01T12:00:00Z");
      expect(result).toContain("2024");
    });
  });
});
