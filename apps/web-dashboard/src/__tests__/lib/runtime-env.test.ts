import { describe, expect, test } from "vitest";
import { getEnv, setTestEnv, textBinding } from "../../lib/runtime-env";
import { APP_VERSION } from "../../lib/version";

describe("runtime-env", () => {
  test("falls back to the worker stub when no override is set", () => {
    setTestEnv(undefined);
    expect(textBinding("CF_ACCESS_TEAM_DOMAIN")).toBe("nocoo");
    expect(getEnv().RESOURCE_ENV).toBe("test");
  });

  test("textBinding returns empty string for non-string values", () => {
    setTestEnv({ FLAG: 1, NAME: "ok" });
    expect(textBinding("FLAG")).toBe("");
    expect(textBinding("NAME")).toBe("ok");
    expect(textBinding("MISSING")).toBe("");
  });
});

describe("APP_VERSION", () => {
  test("reads the dashboard package version", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});
