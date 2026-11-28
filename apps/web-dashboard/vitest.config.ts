import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "node_modules/.cache/vitest",
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
      "next/server": resolve(import.meta.dirname, "node_modules/next/server.js"),
      "cloudflare:workers": resolve(
        import.meta.dirname,
        "src/__tests__/cloudflare-workers-stub.ts",
      ),
    },
  },
  test: {
    globals: false,
    allowOnly: false,
    passWithNoTests: false,
    pool: "threads",
    setupFiles: ["./src/__tests__/setup.ts"],
    include: ["src/__tests__/**/*.test.ts", "src/__tests__/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "src/__tests__/e2e/**",
      "src/__tests__/bdd/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx", "worker-entry.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "**/__tests__/**",
        // Operational deploy/cutover scripts — not web-dashboard runtime code
        "scripts/**",
        "src/proxy.ts",
        "src/app/**/*.tsx",
        "src/components/**",
        "src/views/**",
        "src/pages/**",
        "src/hooks/**",
        "**/index.ts",
        "**/types.ts",
        "src/lib/palette.ts",
        "src/lib/chart-config.ts",
        "src/services/prompt-defaults.ts",
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
