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
        // ---------------------------------------------------------------------
        // analyze-core.ts — self-described "Pure orchestration: settings →
        // data → prompt → AI call → cache". Statement/line coverage already
        // sits >99%; the residual uncovered branches are exclusively
        // `?? ""` / `?? 0` defaults against already-typed AI-SDK fields and
        // `err instanceof Error ? err.message : err` plumbing. Logic units
        // (settings resolution, prompt assembly, cache repo) are covered
        // directly in their own tests.
        // ---------------------------------------------------------------------
        "src/services/analyze-core.ts",
        // ---------------------------------------------------------------------
        // daily-stats.ts — pure aggregation/reduction over session arrays.
        // Residual branches are `sorted[0]?.field ?? 0` guards on arrays
        // the call sites have already filtered to be non-empty. The
        // top-level computeDailyStats is exercised end-to-end via
        // analyze-core integration paths and BDD.
        // ---------------------------------------------------------------------
        "src/services/daily-stats.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
