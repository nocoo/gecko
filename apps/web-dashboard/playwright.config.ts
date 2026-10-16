import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.GECKO_TEST_URL;
if (!baseURL) {
  throw new Error("GECKO_TEST_URL is required; run via bun run test:l3");
}

export default defineConfig({
  testDir: "./e2e/bdd",
  outputDir: "./test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    extraHTTPHeaders: process.env.GECKO_TEST_JWT
      ? { "cf-access-jwt-assertion": process.env.GECKO_TEST_JWT }
      : {},
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
