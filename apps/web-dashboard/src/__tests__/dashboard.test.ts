import { describe, test, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Dashboard page helper tests
//
// We extract the pure helper functions and test them directly.
// Component rendering is covered by E2E tests.
// ---------------------------------------------------------------------------

// Duplicated from page.tsx for testing (these are pure functions)
function formatDuration(seconds: number): string {
  if (seconds === 0) return "0m";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  if (minutes > 0) return `${minutes}m`;

  return `${Math.round(seconds)}s`;
}

function periodLabel(period: string): string {
  switch (period) {
    case "today":
      return "Today";
    case "week":
      return "Last 7 days";
    case "month":
      return "Last 30 days";
    case "all":
      return "All time";
    default:
      return period;
  }
}

describe("Dashboard helpers", () => {
  describe("formatDuration", () => {
    test("returns '0m' for zero", () => {
      expect(formatDuration(0)).toBe("0m");
    });

    test("returns seconds for < 60", () => {
      expect(formatDuration(45)).toBe("45s");
    });

    test("returns minutes for < 3600", () => {
      expect(formatDuration(300)).toBe("5m");
    });

    test("returns hours and minutes", () => {
      expect(formatDuration(3720)).toBe("1h 2m");
    });

    test("returns hours only when no remainder minutes", () => {
      expect(formatDuration(7200)).toBe("2h");
    });

    test("handles large durations", () => {
      expect(formatDuration(36000)).toBe("10h");
    });

    test("rounds seconds", () => {
      expect(formatDuration(30.7)).toBe("31s");
    });
  });

  describe("periodLabel", () => {
    test("returns 'Today' for today", () => {
      expect(periodLabel("today")).toBe("Today");
    });

    test("returns 'Last 7 days' for week", () => {
      expect(periodLabel("week")).toBe("Last 7 days");
    });

    test("returns 'Last 30 days' for month", () => {
      expect(periodLabel("month")).toBe("Last 30 days");
    });

    test("returns 'All time' for all", () => {
      expect(periodLabel("all")).toBe("All time");
    });
  });
});
