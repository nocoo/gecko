/**
 * G1 toolchain smoke — catch transitive ABI regressions in shadcn's minimatch
 * chain that osv-scanner (version-only) and typecheck (no runtime imports)
 * can't see.
 *
 * Loads `minimatch` and runs a brace expansion, exercising the
 * `import { expand } from "brace-expansion"` path inside minimatch. If a
 * future `brace-expansion` override lands on a version that drops the ESM
 * named export (2.x shipped CJS-only), this import throws
 * `SyntaxError: Export named 'expand' not found` before the assertions run.
 *
 * The check is intentionally version-agnostic: no `brace-expansion` /
 * `minimatch` versions or import shapes are pinned here — we only assert
 * that the toolchain the current lockfile installed still works end-to-end.
 *
 * Runs in < 100ms, no network. Belongs in G1 (pre-commit), not G2 — G2's
 * scope is vulnerabilities and secrets, not ABI compatibility.
 */

import { minimatch } from "minimatch";

function assert(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    console.error(`toolchain-smoke FAILED: ${label} — got ${actual}, want ${expected}`);
    process.exit(1);
  }
}

assert(minimatch("a", "{a,b}"), true, "brace-expansion positive match");
assert(minimatch("z", "{a,b}"), false, "brace-expansion negative match");

console.log("toolchain-smoke: passed");
