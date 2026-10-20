import { expect, type Page } from "@playwright/test";

export async function visit(page: Page, route: string) {
  await page.goto(route);
  // AccentProvider applies this attribute in its client effect, after hydration.
  await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
}
