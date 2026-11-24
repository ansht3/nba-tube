import { expect, test } from "./fixtures";

const cards = (page: import("@playwright/test").Page) => page.locator("main article");
const scrollToEnd = (page: import("@playwright/test").Page) => page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const isPageRequest = (url: URL) => url.pathname === "/api/videos" && url.searchParams.has("cursor");

/** Scrolls until the list stops growing (or the sentinel is gone) and returns the hrefs shown. */
async function loadEverything(page: import("@playwright/test").Page) {
  for (let i = 0; i < 60; i++) {
    await scrollToEnd(page);
    await page.waitForTimeout(150);
    if ((await page.locator("[data-feed-sentinel]").count()) === 0) break;
  }
  return page.locator('main article a[href^="/watch/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
}

test("the next page loads by itself as the end comes near, with no button", async ({ page }) => {
  await page.goto("/browse/");
  const first = await cards(page).count();
  expect(first).toBe(48);
  await expect(page.getByRole("button", { name: /show more/i })).toHaveCount(0);
  await scrollToEnd(page);
  await expect.poll(() => cards(page).count()).toBeGreaterThan(first);
});

test("scrolling to the end shows every video exactly once", async ({ page }) => {
  await page.goto("/browse/");
  const total = Number((await page.getByRole("status").filter({ hasText: /videos$/ }).first().textContent())!.replace(/[^0-9]/g, ""));
  const hrefs = await loadEverything(page);
  expect(hrefs.length).toBe(total);
  expect(new Set(hrefs).size, "no video appears twice").toBe(hrefs.length);
  await expect(page.locator("[data-feed-sentinel]")).toHaveCount(0);
});

test("placeholders hold the place of a page that is still loading", async ({ page }) => {
  await page.route(isPageRequest, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto("/browse/");
  await scrollToEnd(page);
  await expect(page.locator(".animate-pulse").first()).toBeVisible();
  await expect.poll(() => cards(page).count()).toBeGreaterThan(48);
  await expect(page.locator(".animate-pulse")).toHaveCount(0);
});

test("a failed page stops loading and waits for a retry, without hammering the server", async ({ page }) => {
  const requests: string[] = [];
  let failing = true;
  await page.route(isPageRequest, async (route) => {
    requests.push(route.request().url());
    if (failing) await route.fulfill({ status: 500, json: { error: "down" } });
    else await route.continue();
  });
  await page.goto("/browse/");
  await scrollToEnd(page);
  await expect(page.getByRole("alert").filter({ hasText: "could not be loaded" })).toBeVisible();
  const afterFailure = requests.length;
  await scrollToEnd(page);
  await page.waitForTimeout(800);
  expect(requests.length, "no automatic retry loop").toBe(afterFailure);
  expect(await cards(page).count()).toBe(48);

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => cards(page).count()).toBeGreaterThan(48);
  await expect(page.getByRole("alert").filter({ hasText: "could not be loaded" })).toHaveCount(0);
});

test("rapid scrolling never asks for the same page twice", async ({ page }) => {
  const cursors: string[] = [];
  await page.route(isPageRequest, async (route) => {
    cursors.push(new URL(route.request().url()).searchParams.get("cursor")!);
    await route.continue();
  });
  await page.goto("/browse/");
  for (let i = 0; i < 25; i++) {
    await scrollToEnd(page);
    await page.evaluate(() => window.scrollBy(0, -200));
  }
  await page.waitForTimeout(500);
  expect(cursors.length).toBeGreaterThan(0);
  expect(new Set(cursors).size, "each page requested once").toBe(cursors.length);
  const hrefs = await page.locator('main article a[href^="/watch/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(hrefs.length);
});

test("going to a video and back returns to the same list and place", async ({ page }) => {
  await page.goto("/browse/");
  await scrollToEnd(page);
  await expect.poll(() => cards(page).count()).toBeGreaterThan(48);
  await scrollToEnd(page);
  await expect.poll(() => cards(page).count()).toBeGreaterThan(72);
  await page.evaluate(() => window.scrollBy(0, -1500));
  await page.waitForTimeout(300);
  const before = { cards: await cards(page).count(), scrollY: await page.evaluate(() => Math.round(window.scrollY)) };

  // Click a card the way a viewer does (a client-side navigation), then use the browser's Back.
  const card = page.locator('main article a[href^="/watch/"]').nth(60);
  await card.scrollIntoViewIfNeeded();
  const scrollAtClick = await page.evaluate(() => Math.round(window.scrollY));
  await card.click();
  await expect(page.locator("iframe")).toBeVisible();
  await page.goBack();
  before.scrollY = scrollAtClick;

  await expect(page).toHaveURL(/\/browse\/$/);
  await expect.poll(() => cards(page).count(), "the loaded list is restored, not reset to the first page").toBeGreaterThanOrEqual(before.cards);
  await expect.poll(() => page.evaluate(() => Math.round(window.scrollY)), "and so is the scroll position").toBeGreaterThan(before.scrollY - 150);
});

test("a filtered list pages too, and changing the filter starts over", async ({ page }) => {
  await page.goto("/browse/?sort=oldest");
  await expect(page.getByRole("status").filter({ hasText: /videos?$/ })).toBeVisible();
  const oldest = await page.locator('main article a[href^="/watch/"]').first().getAttribute("href");
  await page.goto("/browse/");
  const newest = await page.locator('main article a[href^="/watch/"]').first().getAttribute("href");
  expect(oldest).not.toBe(newest);
});
