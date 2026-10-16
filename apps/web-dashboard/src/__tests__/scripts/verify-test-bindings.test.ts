import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import {
  isRemoteFallback,
  PRODUCTION_DB_ID,
  testStateRoot,
  verifyTestBindings,
} from "../../../scripts/verify-test-bindings";

const originals = { ...process.env };

afterEach(() => {
  for (const key of [
    "CLOUDFLARE_DEPLOY",
    "GECKO_TEST_DB_ID",
    "CF_API_TOKEN",
    "CLOUDFLARE_API_TOKEN",
  ]) {
    if (originals[key] === undefined) delete process.env[key];
    else process.env[key] = originals[key];
  }
});

describe("verifyTestBindings", () => {
  test("accepts a path under .cloudflare/tests", () => {
    const root = mkdtempSync(join(tmpdir(), "gecko-root-"));
    mkdirSync(testStateRoot(root), { recursive: true });
    const state = mkdtempSync(join(testStateRoot(root), "l2-"));
    delete process.env.CLOUDFLARE_DEPLOY;
    delete process.env.CF_API_TOKEN;
    delete process.env.CLOUDFLARE_API_TOKEN;
    expect(() => verifyTestBindings(state, root)).not.toThrow();
    rmSync(root, { recursive: true, force: true });
  });

  test("rejects production deploy and production db id", () => {
    const root = mkdtempSync(join(tmpdir(), "gecko-root-"));
    mkdirSync(testStateRoot(root), { recursive: true });
    const state = mkdtempSync(join(testStateRoot(root), "l2-"));
    process.env.CLOUDFLARE_DEPLOY = "production";
    expect(() => verifyTestBindings(state, root)).toThrow(/CLOUDFLARE_DEPLOY/);
    delete process.env.CLOUDFLARE_DEPLOY;
    process.env.GECKO_TEST_DB_ID = PRODUCTION_DB_ID;
    expect(() => verifyTestBindings(state, root)).toThrow(/differ from production/);
    rmSync(root, { recursive: true, force: true });
  });

  test("rejects paths outside the tests directory", () => {
    const root = mkdtempSync(join(tmpdir(), "gecko-root-"));
    const outside = mkdtempSync(join(root, "outside-"));
    expect(() => verifyTestBindings(outside, root)).toThrow(/dedicated/);
    rmSync(root, { recursive: true, force: true });
  });

  test("isRemoteFallback detects tokens and production deploy", () => {
    expect(isRemoteFallback({})).toBe(false);
    expect(isRemoteFallback({ CF_API_TOKEN: "x" })).toBe(true);
    expect(isRemoteFallback({ CLOUDFLARE_DEPLOY: "production" })).toBe(true);
  });

  test("uses the provided env rather than process.env tokens", () => {
    const root = mkdtempSync(join(tmpdir(), "gecko-root-"));
    mkdirSync(testStateRoot(root), { recursive: true });
    const state = mkdtempSync(join(testStateRoot(root), "l2-"));
    process.env.CF_API_TOKEN = "parent-token";
    expect(() => verifyTestBindings(state, root, {})).not.toThrow();
    expect(() => verifyTestBindings(state, root, { CF_API_TOKEN: "x" })).toThrow(/tokens/);
    rmSync(root, { recursive: true, force: true });
  });

  test("testStateRoot is inside the project", () => {
    expect(testStateRoot("/tmp/proj")).toBe(resolve("/tmp/proj", ".cloudflare/tests"));
  });
});
