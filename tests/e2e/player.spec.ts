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
