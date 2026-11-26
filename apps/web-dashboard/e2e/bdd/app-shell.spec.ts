import { expect, test } from "@playwright/test";
import { visit } from "./navigation";

const shellSelector = "#main-content, [data-basalt-header], [data-basalt-island]";

test("daily navigation retains the shared shell at 1440px", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let userRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/me") userRequests++;
  });
  await visit(page, "/daily/2026-10-16");
  await expect(page.getByText("e2e@test.local", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByRole("button", { name: "Expand sidebar" })).toBeVisible();
  const initialUserRequests = userRequests;
  const shell = await page.locator(shellSelector).elementHandles();
  expect(shell).toHaveLength(3);
  const sidebar = await page.locator("[data-basalt-sidebar]").elementHandle();
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
  });

  await page.getByRole("button", { name: "Next day" }).click();
  await expect(page).toHaveURL(/\/daily\/2026-10-17$/);
  await expect(page.getByRole("button", { name: "Choose review date" })).toHaveText(
    "Sat, Oct 17, 2026",
  );
  await page.goBack();
  await expect(page.getByRole("button", { name: "Choose review date" })).toHaveText(
    "Fri, Oct 16, 2026",
  );
  for (const node of shell)
    expect(await node.evaluate((element) => element.isConnected)).toBe(true);
  if (sidebar) {
    expect(await sidebar.evaluate((element) => element.isConnected)).toBe(true);
    expect(userRequests).toBe(initialUserRequests);
  }
  expect(documentRequests).toBe(0);
});

test("sidebar navigation preserves one shell across every dashboard page", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, "/integrations/api");
  const shell = await page.locator(`${shellSelector}, [data-basalt-sidebar]`).elementHandles();
  expect(shell).toHaveLength(4);
  let documentRequests = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
  });

  for (const [label, path, heading] of [
    ["Sessions", "/sessions", "Sessions"],
    ["Apps", "/apps", "Apps"],
    ["Categories", "/settings/categories", "Categories"],
    ["Tags", "/settings/tags", "Tags"],
    ["General", "/settings", "Settings"],
    ["AI Settings", "/settings/ai", "AI Settings"],
    ["Backy", "/settings/backy", "Backy"],
    ["API", "/integrations/api", "API"],
    ["Dashboard", "/", "Hey,"],
    ["Daily Review", "/daily", "Daily Review"],
  ] as const) {
    const link = page
      .locator("[data-basalt-sidebar]")
      .getByRole("link", { name: label, exact: true });
    await link.click();
    await expect(page).toHaveURL(
      path === "/daily" ? /\/daily\/\d{4}-\d{2}-\d{2}$/ : new RegExp(`${path}$`),
    );
    await expect(page.locator("h1").first()).toContainText(heading);
    await expect(link).toHaveAttribute("aria-current", "page");
  }
  expect(documentRequests).toBe(0);
});

test("sidebar sign-out uses Cloudflare Access logout URL", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page, "/");
  const signOut = page.getByRole("link", { name: "Sign out", exact: true });
  await expect(signOut).toBeVisible();
  await expect(signOut).toHaveAttribute("href", "/cdn-cgi/access/logout");
});
