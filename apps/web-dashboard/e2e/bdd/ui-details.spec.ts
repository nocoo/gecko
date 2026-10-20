import { expect, test } from "@playwright/test";
import { humanApi, jsonBody, makeSession, syncSessions } from "../../src/__tests__/e2e/harness";

const routes = [
  "/",
  "/sessions",
  "/daily",
  "/apps",
  "/settings/categories",
  "/settings/tags",
  "/integrations/api",
  "/settings/backy",
  "/settings",
  "/settings/ai",
];

for (const width of [320, 390, 1440]) {
  for (const theme of ["light", "dark"]) {
    test.describe(`${width}px ${theme}`, () => {
      test.use({ viewport: { width, height: 900 } });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((mode) => localStorage.setItem("theme", mode), theme);
      });
      for (const route of routes) {
        test(`${route} keeps its content within the viewport`, async ({ page }) => {
          const errors: string[] = [];
          page.on("pageerror", (error) => errors.push(error.message));
          await page.goto(route);
          await expect(page.locator("h1").first()).toBeVisible();
          await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
          await expect(page.locator("html")).toHaveAttribute("data-mode", theme);
          await expect
            .poll(() =>
              page
                .locator("[data-basalt-island]")
                .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
            )
            .toBe(true);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          ).toBe(true);
          expect(errors).toEqual([]);
          if (route === "/") {
            await expect(page.getByRole("radio", { name: "7 Days", exact: true })).toHaveCSS(
              "padding-left",
              "10px",
            );
            const refresh = page.getByRole("button", { name: "Refresh dashboard" });
            await expect(refresh).toHaveCSS("width", "34px");
            await expect(refresh).toHaveCSS("height", "34px");
            expect(
              await refresh.evaluate(
                (element) => element.getBoundingClientRect().right <= innerWidth,
              ),
            ).toBe(true);
            await expect
              .poll(() =>
                page.locator('[aria-label="Time period"]').evaluate((group) => {
                  const selected = group
                    .querySelector('[aria-checked="true"]')
                    ?.getBoundingClientRect();
                  const marker = group
                    .querySelector('[data-slot="selection-indicator"]')
                    ?.getBoundingClientRect();
                  return (
                    !!selected &&
                    !!marker &&
                    (["x", "y", "width", "height"] as const).every(
                      (key) => Math.abs(selected[key] - marker[key]) < 1,
                    )
                  );
                }),
              )
              .toBe(true);
          }
        });
      }
      test("API actions retain one line and matching control heights", async ({ page }) => {
        await page.goto("/integrations/api");
        const create = page.getByRole("button", { name: "Create", exact: true });
        const name = page.getByLabel("Create New Key");
        await expect(create).toHaveCSS("height", "34px");
        await expect(name).toHaveCSS("height", "34px");
        const request = page.getByRole("button", { name: "Send Request", exact: true });
        await expect(request).toHaveCSS("height", "34px");
        expect(
          await request.evaluate((element) => element.getBoundingClientRect().right <= innerWidth),
        ).toBe(true);
      });
    });
  }
}

test("sidebar uses native links, neutral surfaces and a stable logo", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/integrations/api");
  const sidebar = page.locator("[data-basalt-sidebar]");
  const logo = sidebar.getByAltText("Gecko", { exact: true });
  const x = (await logo.boundingBox())!.x;
  await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).toHaveCSS(
    "font-size",
    "14px",
  );
  await expect(sidebar.getByRole("link", { name: "Dashboard", exact: true })).toHaveCSS(
    "line-height",
    "22px",
  );
  await expect(sidebar.getByRole("link", { name: "API", exact: true })).toHaveAttribute(
    "href",
    "/integrations/api",
  );
  expect(
    await sidebar.evaluate(
      (element) =>
        getComputedStyle(element).backgroundColor ===
        getComputedStyle(document.body).backgroundColor,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveCSS("width", "68px");
  expect((await logo.boundingBox())!.x).toBe(x);
  await expect(sidebar.getByRole("link", { name: "API", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  const opener = page.getByRole("button", { name: "Open navigation menu" });
  await page.getByLabel("Create New Key").focus();
  await opener.evaluate((element) => {
    element.addEventListener("mousedown", (event) => event.preventDefault(), { once: true });
  });
  await opener.click();
  await expect(
    page.getByRole("button", { name: "Open navigation menu", includeHidden: true }),
  ).toHaveAttribute("aria-expanded", "true");
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer.getByRole("link", { name: "Categories", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await expect(opener).toHaveAttribute("aria-expanded", "false");
  await opener.click();
  await page.locator('[data-state="open"].backdrop-blur-md').click({
    position: { x: 380, y: 420 },
  });
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await drawer.getByRole("link", { name: "Categories", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/categories$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("session search uses the native input group and clear action", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/sessions");
  const filter = page.getByRole("textbox", { name: "Filter sessions" });
  await filter.fill("Safari");
  const clear = page.getByRole("button", { name: "Clear session filter" });
  expect(
    await clear.evaluate((element) => element.getBoundingClientRect().right <= innerWidth),
  ).toBe(true);
  await clear.click();
  await expect(filter).toHaveValue("");
  await expect(clear).toHaveCount(0);
});

for (const [route, label] of [
  ["/settings/categories", "New Category"],
  ["/settings/tags", "New Tag"],
] as const) {
  test(`${label} dialog restores keyboard focus`, async ({ page }) => {
    await page.goto(route);
    const opener = page.getByRole("button", { name: label, exact: true });
    await opener.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog").getByRole("textbox").first()).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
  });
}

test("AI variable menu fits mobile and preserves editing focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/settings/ai");
  await expect(page.getByRole("combobox", { name: "Provider" })).toBeVisible();
  const opener = page.getByRole("button", { name: "Insert Variable" });
  await expect(opener).toHaveCSS("height", "28px");
  await opener.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  expect(
    await menu.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth;
    }),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();
  await opener.click();
  await page.getByRole("menuitem").first().click();
  await expect(page.getByLabel("Data Injection", { exact: true })).toBeFocused();
  await expect(page.getByRole("button", { name: "Save Prompt" })).toBeEnabled();
});

test("app metadata controls preserve real assignments on mobile", async ({ page }) => {
  const appName = "UI Details App";
  const bundleId = "com.gecko.ui-details";
  const categoryName = `Category ${"long name ".repeat(12)}`.trim();
  const tagName = `Tag ${"long name ".repeat(12)}`.trim();
  expect(
    (await syncSessions([makeSession({ app_name: appName, bundle_id: bundleId })])).status,
  ).toBe(202);
  expect(
    (await humanApi("/api/categories", jsonBody("POST", { title: categoryName, icon: "folder" })))
      .ok,
  ).toBe(true);
  expect((await humanApi("/api/tags", jsonBody("POST", { name: tagName }))).ok).toBe(true);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/apps");
  const category = page.getByRole("combobox", { name: `Category for ${appName}` });
  await category.click();
  await page.getByRole("option", { name: categoryName, exact: true }).click();
  const tags = page.getByRole("button", { name: `Edit tags for ${appName}` });
  await tags.click();
  await page.getByRole("button", { name: tagName, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(tags).toBeFocused();
  expect(
    await page
      .locator("[data-basalt-island]")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await page.getByRole("button", { name: "Save 2 changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^(Save \d+ changes?|Saving\.\.\.)$/ }),
  ).toHaveCount(0);
  await page.reload();
  await expect(category).toContainText(categoryName);
  await expect(page.getByText(tagName, { exact: true })).toBeVisible();
  expect(
    await page
      .locator("[data-basalt-island]")
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
  ).toBe(true);
  await category.click();
  await page.getByRole("option", { name: "Uncategorized", exact: true }).click();
  await page.getByRole("button", { name: "Save 1 change", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^(Save \d+ changes?|Saving\.\.\.)$/ }),
  ).toHaveCount(0);
  await page.reload();
  await expect(category).toContainText("Uncategorized");
  await category.click();
  await page.getByRole("option", { name: categoryName, exact: true }).click();
  await category.click();
  await page.getByRole("option", { name: "Uncategorized", exact: true }).click();
  await expect(category).toContainText("Uncategorized");
  await expect(page.getByRole("button", { name: "Save 1 change", exact: true })).toHaveCount(0);
  for (const route of ["/settings/categories", "/settings/tags"]) {
    await page.goto(route);
    await expect(
      page.getByRole("button", {
        name: `Edit ${route.endsWith("tags") ? tagName : categoryName}`,
        exact: true,
      }),
    ).toBeVisible();
    expect(
      await page
        .locator("[data-basalt-island]")
        .evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
    ).toBe(true);
  }
});

for (const width of [320, 390, 1440]) {
  test(`daily calendar stays within the ${width}px viewport`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/daily");
    await page.getByRole("button", { name: "Choose review date" }).click();
    const calendar = page.getByRole("grid");
    await expect(calendar).toBeVisible();
    expect(
      await calendar.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth;
      }),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Choose review date" })).toBeFocused();
  });
}

test("AI custom model editor hands focus back to the preset selector", async ({ page }) => {
  await page.goto("/settings/ai");
  await page.getByRole("combobox", { name: "Provider", exact: true }).click();
  await page.getByRole("option", { name: "Anthropic", exact: true }).click();
  await page.getByRole("combobox", { name: "Model", exact: true }).click();
  await page.getByRole("option", { name: "Custom model...", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Model", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Use preset model", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeFocused();
});

test("daily calendar moves keyboard focus before selecting a date", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/daily");
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
  await expect(page.getByRole("button", { name: "Choose review date" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(page.getByRole("grid")).toHaveCount(0);
});
