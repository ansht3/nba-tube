import { builtCatalog, expect, test } from "./fixtures";

test("an unplayable video shows a fallback with a YouTube link", async ({ page }) => {
  const id = builtCatalog()[0].youtubeId;
  // Stand in for the IFrame Player API and report error 150 (embedding disabled).
  await page.route(/youtube\.com\/iframe_api/, (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.YT = { Player: function (el, opts) { setTimeout(function () { opts.events.onError({ data: 150 }); }, 50); this.destroy = function () {}; } };
             window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady();`,
    }),
  );
  await page.goto(`/watch/${id}/`);
  await expect(page.getByText("This video can't be played here")).toBeVisible();
  await expect(page.getByRole("link", { name: "Try it on YouTube" })).toHaveAttribute("href", `https://www.youtube.com/watch?v=${id}`);
});

test("the player keeps the minimum size YouTube requires", async ({ page }) => {
  await page.goto(`/watch/${builtCatalog()[0].youtubeId}/`);
  const box = (await page.locator("iframe").boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(200);
  expect(box.height).toBeGreaterThanOrEqual(200);
});

test("the mobile menu opens, navigates and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "On desktop the menu button collapses the sidebar instead");
  await page.goto("/");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await dialog.getByRole("link", { name: "Teams" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  await expect(dialog).toBeHidden();
});

test("the player is in the page HTML and loads without JavaScript", async ({ browser }) => {
  const id = builtCatalog()[0].youtubeId;
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.route(/youtube-nocookie\.com/, (route) => route.fulfill({ body: "<html><body>player</body></html>", contentType: "text/html" }));
  await page.goto(`/watch/${id}/`);
  await expect(page.locator("iframe")).toHaveAttribute("src", new RegExp(`/embed/${id}\\?`));
  await context.close();
});

test("moving to a related video swaps in that video's player", async ({ page }) => {
  await page.goto(`/watch/${builtCatalog()[0].youtubeId}/`);
  const related = page.locator("aside[aria-labelledby=related-heading] a").first();
  const target = (await related.getAttribute("href"))!.split("/").filter(Boolean).pop()!;
  await related.click();
  await expect(page).toHaveURL(new RegExp(`/watch/${target}/`));
  await expect(page.locator("iframe")).toHaveCount(1);
  await expect(page.locator("iframe")).toHaveAttribute("src", new RegExp(`/embed/${target}\\?`));
  await page.goBack();
  await expect(page.locator("iframe")).toHaveCount(1);
});

test("the header stays pinned to the top while the page scrolls", async ({ page }) => {
  await page.goto("/highlights/");
  const header = page.locator("body > header");
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const box = (await header.boundingBox())!;
  expect(box.y).toBe(0);
  expect(await header.evaluate((element) => getComputedStyle(element).position)).toBe("fixed");
  // Content starts below the header instead of underneath it.
  await page.evaluate(() => window.scrollTo(0, 0));
  const heading = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  expect(heading.y).toBeGreaterThanOrEqual(box.height);
});

test("on desktop the menu button collapses the sidebar to a rail and remembers it", async ({ page, isMobile }) => {
  test.skip(isMobile, "The sidebar only exists on wide screens");
  await page.goto("/");
  const sidebar = page.locator(".site-sidebar");
  expect((await sidebar.boundingBox())!.width).toBeGreaterThan(200);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeLessThan(80);
  // Every link is still reachable in the rail.
  await page.locator(".site-sidebar").getByRole("link", { name: "Watch later" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Watch later" })).toBeVisible();
  await page.reload();
  expect((await sidebar.boundingBox())!.width).toBeLessThan(80);
});

test("the watch page shows related videos in a right-hand column on desktop", async ({ page, isMobile }) => {
  test.skip(isMobile, "On phones related videos follow the player");
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`/watch/${builtCatalog()[0].youtubeId}/`);
    const player = (await page.locator("main iframe").boundingBox())!;
    const related = (await page.locator("aside[aria-labelledby=related-heading]").boundingBox())!;
    expect(related.x, `at ${width}px`).toBeGreaterThan(player.x + player.width);
    expect(related.y, `at ${width}px`).toBeLessThan(player.y + player.height);
    expect(await page.locator("aside[aria-labelledby=related-heading] li").count()).toBeGreaterThan(5);
  }
});

test("the watch page menu opens the navigation drawer", async ({ page }) => {
  await page.goto(`/watch/${builtCatalog()[0].youtubeId}/`);
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
});
