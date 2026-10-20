// L3 (6DQ System/E2E) — Playwright; run via `bun run test:bdd` / root `test:l3`.
import { expect, test } from "@playwright/test";

test.describe("Dashboard — BDD Smoke", () => {
  test("Given the app is running, When I visit the dashboard, Then I see the page heading", async ({
    page,
  }) => {
    // Given: app is running (webServer handles this)

    // When: visit dashboard
    await page.goto("/");

    // Then: page loads with dashboard heading
    await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });

    const refresh = page.locator("button:has(.lucide-refresh-cw)");
    await expect(refresh).toHaveCSS("width", "32px");
    await expect(refresh).toHaveCSS("height", "32px");
  });

  test("API key actions retain compact icon dimensions", async ({ page }) => {
    await page.goto("/integrations/api");

    for (const title of ["Rename", "Delete"]) {
      const action = page.getByTitle(title, { exact: true });
      await expect(action).toBeVisible();
      await expect(action).toHaveCSS("width", "24px");
      await expect(action).toHaveCSS("height", "24px");
    }
  });
});
