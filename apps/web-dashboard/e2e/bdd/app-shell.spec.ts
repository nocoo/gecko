import { expect, test } from "@playwright/test";
import { visit } from "./navigation";

const shellSelector = "#main-content, [data-basalt-header], [data-basalt-island]";

for (const width of [390, 1440]) {
  test(`daily navigation retains the shared shell at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let userRequests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/me") userRequests++;
    });
    await visit(page, "/daily/2026-10-16");
    if (width === 1440) {
      await expect(page.getByText("e2e@test.local", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    } else {
      await expect(page.getByRole("button", { name: "Open navigation menu" })).toBeVisible();
    }
    const initialUserRequests = userRequests;
    const shell = await page.locator(shellSelector).elementHandles();
    expect(shell).toHaveLength(3);
    const sidebar =
      width === 1440 ? await page.locator("[data-basalt-sidebar]").elementHandle() : null;
    let documentRequests = 0;
    page.on("request", (request) => {
      if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
    });

    await page.getByRole("button", { name: "Next day" }).click();
    await expect(page).toHaveURL(/\/daily\/2026-10-17$/);
    await expect(page.getByRole("button", { name: "Choose review date" })).toHaveText(
      "Sat, Oct 17, 2026",
    );
    await expect(page.locator("[data-basalt-header]")).toContainText("Sat, Oct 17, 2026");
    for (const node of shell) expect(await node.isVisible()).toBe(true);

    await page.getByRole("button", { name: "Choose review date" }).click();
    await page.getByRole("grid").locator('[aria-selected="true"] button').focus();
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/daily\/2026-10-16$/);
    await expect(page.getByRole("grid")).toHaveCount(0);

    await page.goBack();
    await expect(page.getByRole("button", { name: "Choose review date" })).toHaveText(
      "Sat, Oct 17, 2026",
    );
    await expect(page.locator("[data-basalt-header]")).toContainText("Sat, Oct 17, 2026");
    await page.goForward();
    await expect(page.getByRole("button", { name: "Choose review date" })).toHaveText(
      "Fri, Oct 16, 2026",
    );
    await expect(page.locator("[data-basalt-header]")).toContainText("Fri, Oct 16, 2026");
    for (const node of shell)
      expect(await node.evaluate((element) => element.isConnected)).toBe(true);
    for (const node of shell) expect(await node.isVisible()).toBe(true);
    if (sidebar) {
      expect(await sidebar.evaluate((element) => element.isConnected)).toBe(true);
      await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
      expect(userRequests).toBe(initialUserRequests);
    }
    expect(documentRequests).toBe(0);
  });
}

test("sidebar navigation preserves one shell across every dashboard page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, "/integrations/api");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  const shell = await page.locator(`${shellSelector}, [data-basalt-sidebar]`).elementHandles();
  expect(shell).toHaveLength(4);
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
  });

  for (const [label, path, heading, breadcrumb] of [
    ["Sessions", "/sessions", "Sessions", "Sessions"],
    ["Apps", "/apps", "Apps", "Apps"],
    ["Categories", "/settings/categories", "Categories", "Categories"],
    ["Tags", "/settings/tags", "Tags", "Tags"],
    ["General", "/settings", "Settings", "Settings"],
    ["AI Settings", "/settings/ai", "AI Settings", "AI Settings"],
    ["Backy", "/settings/backy", "Backy", "Backy"],
    ["API", "/integrations/api", "API", "API"],
    ["Dashboard", "/", "Hey,", "Home"],
    ["Daily Review", "/daily", "Daily Review", "Daily Review"],
  ] as const) {
    const link = page
      .locator("[data-basalt-sidebar]")
      .getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(
      path === "/daily" ? /\/daily\/\d{4}-\d{2}-\d{2}$/ : new RegExp(`${path}$`),
    );
    await expect(page.locator("h1").first()).toContainText(heading);
    await expect(page.locator("[data-basalt-header]")).toContainText(breadcrumb);
    await expect(link).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
    for (const node of shell)
      expect(await node.evaluate((element) => element.isConnected)).toBe(true);
    await expect(page.locator("[data-basalt-island]")).toHaveCount(1);
  }
  expect(documentRequests).toBe(0);
});
