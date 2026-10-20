import { describe, expect, test } from "vitest";
import { cn } from "../lib/utils";

describe("src/lib/utils", () => {
  describe("cn", () => {
    test("merges class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    test("handles conditional classes", () => {
      expect(cn("base", false && "hidden", "visible")).toBe("base visible");
    });

    test("merges tailwind classes (twMerge)", () => {
      expect(cn("px-4", "px-8")).toBe("px-8");
    });

    test("handles empty input", () => {
      expect(cn()).toBe("");
    });

    test("handles undefined and null", () => {
      expect(cn("foo", undefined, null, "bar")).toBe("foo bar");
    });

    test("handles array inputs via clsx", () => {
      expect(cn(["foo", "bar"])).toBe("foo bar");
    });

    test("handles object inputs via clsx", () => {
      expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz");
    });
  });
});
