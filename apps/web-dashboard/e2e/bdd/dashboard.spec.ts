import { test, expect } from "@playwright/test";

test.describe("Dashboard — BDD Smoke", () => {
  test("Given the app is running, When I visit the dashboard, Then I see the page heading", async ({ page }) => {
    // Given: app is running (webServer handles this)

    // When: visit dashboard
    await page.goto("/");

    // Then: page loads with dashboard heading
    await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
  });
});
