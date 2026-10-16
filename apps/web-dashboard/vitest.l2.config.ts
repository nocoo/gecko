import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  cacheDir: "node_modules/.cache/vitest-l2",
  resolve: {
    alias: {
      "@": resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    globals: false,
    include: ["src/__tests__/e2e/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
