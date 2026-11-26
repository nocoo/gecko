import { expect, test } from "@playwright/test";
import { humanApi, jsonBody, makeSession, syncSessions } from "../../src/__tests__/e2e/harness";
import { visit } from "./navigation";

test("session search filters and clears", async ({ page }) => {
  await visit(page, "/sessions");
  const filter = page.getByRole("textbox", { name: "Filter sessions" });
  await filter.fill("Safari");
  const clear = page.getByRole("button", { name: "Clear session filter" });
  await clear.click();
  await expect(filter).toHaveValue("");
  await expect(clear).toHaveCount(0);
});

test("app metadata controls preserve real assignments", async ({ page }) => {
  const appName = "UI Details App";
  const bundleId = "com.gecko.ui-details";
  const categoryName = "Smoke Category";
  const tagName = "Smoke Tag";
  expect(
    (await syncSessions([makeSession({ app_name: appName, bundle_id: bundleId })])).status,
  ).toBe(202);
  expect(
    (await humanApi("/api/categories", jsonBody("POST", { title: categoryName, icon: "folder" })))
      .ok,
  ).toBe(true);
  expect((await humanApi("/api/tags", jsonBody("POST", { name: tagName }))).ok).toBe(true);

  await visit(page, "/apps");
  const category = page.getByRole("combobox", { name: `Category for ${appName}` });
  await category.click();
  await page.getByRole("option", { name: categoryName, exact: true }).click();
  const tags = page.getByRole("button", { name: `Edit tags for ${appName}` });
  await tags.click();
  await page.getByRole("button", { name: tagName, exact: true }).click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Save 2 changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^(Save \d+ changes?|Saving\.\.\.)$/ }),
  ).toHaveCount(0);
  await page.reload();
  await expect(category).toContainText(categoryName);
  await expect(page.getByText(tagName, { exact: true })).toBeVisible();
});
