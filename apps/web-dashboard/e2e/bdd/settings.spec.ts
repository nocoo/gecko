import { expect, test } from "@playwright/test";
import { visit } from "./navigation";

for (const [route, label] of [
  ["/settings/categories", "New Category"],
  ["/settings/tags", "New Tag"],
] as const) {
  test(`${label} dialog restores keyboard focus`, async ({ page }) => {
    await visit(page, route);
    const opener = page.getByRole("button", { name: label, exact: true });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("textbox").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
  });
}

test("AI custom model editor hands focus back to the preset selector", async ({ page }) => {
  await visit(page, "/settings/ai");
  await page.getByRole("combobox", { name: "Provider", exact: true }).click();
  await page.getByRole("option", { name: "Anthropic", exact: true }).click();
  await page.getByRole("combobox", { name: "Model", exact: true }).click();
  await page.getByRole("option", { name: "Custom model...", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Model", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Use preset model", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeFocused();
});

test("daily calendar moves keyboard focus before selecting a date", async ({ page }) => {
  await visit(page, "/daily");
  await page.getByRole("button", { name: "Choose review date" }).click();
  const calendar = page.getByRole("grid");
  const selected = calendar.locator('[aria-selected="true"] button');
  await selected.focus();
  const previous = new Date(`${page.url().split("/").at(-1)}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  const before = await selected.getAttribute("aria-label");
  await page.keyboard.press("ArrowLeft");
  await expect(calendar.locator("button:focus")).not.toHaveAttribute("aria-label", before!);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/daily/${previous.toISOString().slice(0, 10)}$`));
  await expect(page.getByRole("grid")).toHaveCount(0);
});
