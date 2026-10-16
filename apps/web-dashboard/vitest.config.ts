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
        "src/proxy.ts",
        "src/app/**",
        "src/components/**",
        "src/hooks/**",
        "src/lib/palette.ts",
        "src/lib/chart-config.ts",
        "src/services/prompt-defaults.ts",
      ],
      thresholds: {
        statements: 95.5,
        branches: 95.5,
        functions: 95.5,
        lines: 95.5,
      },
    },
  },
});
