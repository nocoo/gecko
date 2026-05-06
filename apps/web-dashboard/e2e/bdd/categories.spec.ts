import { test, expect } from "@playwright/test";

test.describe("Categories — CRUD", () => {
  test("renders page with default categories", async ({ page }) => {
    await page.goto("/settings/categories");

    await expect(page.locator("h1")).toContainText("Categories");
    await expect(
      page.getByRole("heading", { name: "Default Categories" })
    ).toBeVisible({ timeout: 10_000 });

    // At least one "Built-in" badge should exist
    await expect(page.getByText("Built-in").first()).toBeVisible();
  });

  test("create a custom category", async ({ page }) => {
    await page.goto("/settings/categories");
    await expect(
      page.getByRole("heading", { name: "Default Categories" })
    ).toBeVisible({ timeout: 10_000 });

    const name = `BDD-Cat-${Date.now()}`;

    await page.getByRole("button", { name: "New Category" }).click();
    await expect(
      page.getByRole("heading", { name: "Create Category" })
    ).toBeVisible();

    await page.locator("#cat-title").fill(name);
    await page.locator('[role="dialog"] button[title]').first().click();
    await page.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByText(name)).toBeVisible({ timeout: 5_000 });
  });

  test("edit a custom category", async ({ page }) => {
    await page.goto("/settings/categories");
    await expect(
      page.getByRole("heading", { name: "Default Categories" })
    ).toBeVisible({ timeout: 10_000 });

    const original = `Edit-Cat-${Date.now()}`;
    const renamed = `Renamed-Cat-${Date.now()}`;

    // Create
    await page.getByRole("button", { name: "New Category" }).click();
    await page.locator("#cat-title").fill(original);
    await page.locator('[role="dialog"] button[title]').first().click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText(original)).toBeVisible({ timeout: 5_000 });

    // The row is a div.bg-secondary containing our category name.
    // Inside it, first button = edit (Pencil), second = delete (Trash2).
    const row = page.locator(".bg-secondary", { hasText: original });
    await row.locator("button").first().click();

    // Edit dialog
    await expect(
      page.getByRole("heading", { name: "Edit Category" })
    ).toBeVisible({ timeout: 3_000 });

    await page.locator("#edit-title").clear();
    await page.locator("#edit-title").fill(renamed);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Wait for dialog to close before asserting on list
    await expect(
      page.getByRole("heading", { name: "Edit Category" })
    ).not.toBeVisible({ timeout: 3_000 });

    await expect(page.getByText(renamed)).toBeVisible({ timeout: 5_000 });
  });

  test("delete a custom category", async ({ page }) => {
    await page.goto("/settings/categories");
    await expect(
      page.getByRole("heading", { name: "Default Categories" })
    ).toBeVisible({ timeout: 10_000 });

    const name = `Del-Cat-${Date.now()}`;

    // Create
    await page.getByRole("button", { name: "New Category" }).click();
    await page.locator("#cat-title").fill(name);
    await page.locator('[role="dialog"] button[title]').first().click();
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 5_000 });

    // Click trash (second button in row)
    const row = page.locator(".bg-secondary", { hasText: name });
    await row.locator("button").nth(1).click();

    // Confirm deletion
    await expect(
      page.getByRole("heading", { name: "Delete Category" })
    ).toBeVisible({ timeout: 3_000 });
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    // Wait for dialog to close
    await expect(
      page.getByRole("heading", { name: "Delete Category" })
    ).not.toBeVisible({ timeout: 3_000 });

    // Category should be gone
    await expect(page.getByText(name, { exact: true })).not.toBeVisible({
      timeout: 5_000,
    });
  });
});
