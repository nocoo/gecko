import { test, expect } from "@playwright/test";

test.describe("Tags — CRUD", () => {
  test("renders page heading", async ({ page }) => {
    await page.goto("/settings/tags");

    await expect(page.locator("h1")).toContainText("Tags");
    await expect(
      page.getByRole("heading", { name: "Your Tags" })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("create a new tag", async ({ page }) => {
    await page.goto("/settings/tags");
    await expect(
      page.getByRole("heading", { name: "Your Tags" })
    ).toBeVisible({ timeout: 10_000 });

    const name = `bdd-tag-${Date.now()}`;

    await page.getByRole("button", { name: "New Tag" }).click();
    await expect(
      page.getByRole("heading", { name: "Create Tag" })
    ).toBeVisible();

    await page.locator("#tag-name").fill(name);
    await page.getByRole("button", { name: "Create", exact: true }).click();

    await expect(page.getByText(name, { exact: true })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("rename a tag", async ({ page }) => {
    await page.goto("/settings/tags");
    await expect(
      page.getByRole("heading", { name: "Your Tags" })
    ).toBeVisible({ timeout: 10_000 });

    const original = `rename-me-${Date.now()}`;
    const renamed = `renamed-${Date.now()}`;

    // Create
    await page.getByRole("button", { name: "New Tag" }).click();
    await page.locator("#tag-name").fill(original);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText(original, { exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Click edit (pencil) — first button in the .bg-secondary row
    const row = page.locator(".bg-secondary", { hasText: original });
    await row.locator("button").first().click();

    await expect(
      page.getByRole("heading", { name: "Rename Tag" })
    ).toBeVisible({ timeout: 3_000 });

    await page.locator("#edit-name").clear();
    await page.locator("#edit-name").fill(renamed);
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Wait for dialog to close before asserting on list
    await expect(
      page.getByRole("heading", { name: "Rename Tag" })
    ).not.toBeVisible({ timeout: 3_000 });

    await expect(page.getByText(renamed, { exact: true })).toBeVisible({
      timeout: 5_000,
    });
  });

  test("delete a tag", async ({ page }) => {
    await page.goto("/settings/tags");
    await expect(
      page.getByRole("heading", { name: "Your Tags" })
    ).toBeVisible({ timeout: 10_000 });

    const name = `del-tag-${Date.now()}`;

    // Create
    await page.getByRole("button", { name: "New Tag" }).click();
    await page.locator("#tag-name").fill(name);
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page.getByText(name, { exact: true })).toBeVisible({
      timeout: 5_000,
    });

    // Click delete (trash) — second button in the .bg-secondary row
    const row = page.locator(".bg-secondary", { hasText: name });
    await row.locator("button").nth(1).click();

    // Confirm deletion
    await expect(
      page.getByRole("heading", { name: "Delete Tag" })
    ).toBeVisible({ timeout: 3_000 });
    await page
      .getByRole("button", { name: "Delete", exact: true })
      .click();

    // Wait for dialog to close
    await expect(
      page.getByRole("heading", { name: "Delete Tag" })
    ).not.toBeVisible({ timeout: 3_000 });

    // Tag should be gone
    await expect(page.getByText(name, { exact: true })).not.toBeVisible({
      timeout: 5_000,
    });
  });
});
