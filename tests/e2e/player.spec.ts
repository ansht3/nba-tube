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
  test.skip(!isMobile, "The menu button only exists on narrow screens");
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Open menu" }).click();
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
