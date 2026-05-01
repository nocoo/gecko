import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "node_modules/.cache/vitest",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      // Next.js doesn't ship `package.json#exports`; Node ESM strict
      // resolution can't find `next/server` without the `.js` extension.
      "next/server": resolve(__dirname, "node_modules/next/server.js"),
    },
  },
  test: {
    globals: false,
    pool: "threads",
    setupFiles: ["./src/__tests__/setup.ts"],
    server: {
      deps: {
        // next-auth imports `next/server` without the `.js` extension that
        // Node ESM strict resolution requires. Inline-transforming it lets the
        // vite resolver (which honors `next/server` → `next/server.js`) resolve.
        inline: ["next-auth", "@auth/core"],
      },
    },
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      // E2E: spawn dev server, gated behind RUN_E2E env. Run via `bun run test:e2e`.
      "src/__tests__/e2e/**",
      // BDD: Playwright suite, run via `bun run test:bdd`.
      "src/__tests__/bdd/**",
    ],
    coverage: {
      provider: "v8",
      // experimentalAstAwareRemapping reduces variance and slightly improves
      // wall-clock by avoiding the legacy source-map-based remap path.
      // (vitest v4 has this as default; flag retained for explicitness.)
      experimentalAstAwareRemapping: true,
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "**/__tests__/**",
        // Next.js framework boundary modules — pure framework wiring, no logic.
        "src/instrumentation.ts",
        // Auth.ts — the testable callbacks (signIn / jwt / session) are
        // exercised in auth.test.ts via NextAuth factory capture; the rest is
        // NextAuth bootstrap that requires a Next.js runtime.
        "src/auth.ts",
        // Next.js proxy / middleware — request-time routing that needs the
        // Next.js server runtime; covered by E2E.
        "src/proxy.ts",
        // App Router pages, layouts, and API route handlers. Logic is
        // extracted into lib/* and services/* (which IS covered);
        // these files are thin Next.js wrappers + JSX.
        "src/app/**",
        // React components and hooks — JSX/DOM behavior, covered by Playwright BDD.
        "src/components/**",
        "src/hooks/**",
        // Pure config/constants — no executable branches worth gating.
        "src/lib/palette.ts",
        "src/lib/chart-config.ts",
        "src/services/prompt-defaults.ts",
        // ---------------------------------------------------------------------
        // backy-push.ts — thin orchestration wrapper: load config → call
        // exportUserData (covered) → gzip (covered) → multipart fetch.
        // The remaining branches are FormData/HTTP plumbing whose units
        // (envelopeStats, compressEnvelope, buildBackupTag) are tested
        // directly in backy.test.ts. End-to-end push is verified by
        // backy-roundtrip.test.ts (E2E).
        // ---------------------------------------------------------------------
        "src/lib/backy-push.ts",
      ],
      thresholds: {
        // Branches sit at ~83% because the codebase relies heavily on
        // TypeScript-strict defensive `if (foo === undefined) throw` guards
        // that only fire on impossible inputs (e.g. malformed
        // `"YYYY-MM-DD".split("-")`), plus `??` fallbacks against
        // already-typed values. v8 counts each guard/fallback as an
        // uncovered branch; testing them requires constructing inputs
        // the type system says cannot exist. 80 keeps the bar honest
        // without forcing tests of unreachable code.
        statements: 95,
        branches: 80,
        functions: 95,
        lines: 95,
      },
    },
  },
});
