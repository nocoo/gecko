import { defineConfig, devices } from "@playwright/test";

/**
 * L4: BDD E2E — Playwright browser tests for core user flows.
 *
 * Server runs on port 27018 with E2E_SKIP_AUTH=true so we bypass
 * Google OAuth. Tests drive a real Chromium browser.
 */
export default defineConfig({
  testDir: "./e2e/bdd",
  outputDir: "./test-results",
  fullyParallel: false, // serial — pages share state (e.g. settings changes)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:27018",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    command:
      "bun run db:init && E2E_SKIP_AUTH=true D1_LOCAL_PATH=.local/gecko-test.db bunx vinext dev --port 27018",
    port: 27018,
    timeout: 60_000,
    stdout: "pipe",
    stderr: "pipe",
    reuseExistingServer: !process.env.CI,
  },
});
