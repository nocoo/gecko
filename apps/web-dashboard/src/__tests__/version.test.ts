import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_VERSION } from "@/lib/version";

const pkg = JSON.parse(
  readFileSync(resolve(__dirname, "../../package.json"), "utf8"),
) as { version: string };

describe("version", () => {
  test("APP_VERSION matches package.json version", () => {
    expect(APP_VERSION).toBe(pkg.version);
  });

  test("APP_VERSION is a valid semver string", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("APP_VERSION is non-empty", () => {
    expect(APP_VERSION.length).toBeGreaterThan(0);
  });
});
