import { expect, test } from "./fixtures";

test("j and k move between videos, Enter opens one, l and w save it, h goes home", async ({ page, consoleErrors }) => {
  await page.goto("/highlights/");
  const links = page.locator("[data-video-link]");
  await expect(links.first()).toBeVisible();

  // The first press retries until the page has hydrated and is listening.
  await expect(async () => {
    await page.keyboard.press("j");
    await expect(links.nth(0)).toBeFocused({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("j");
  await expect(links.nth(1)).toBeFocused();
  await page.keyboard.press("k");
  await expect(links.nth(0)).toBeFocused();

  // "w" on a selected card saves that card, and only that card.
  await page.keyboard.press("w");
  await expect(page.locator("main article").first().locator(".thumb-action")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('main .thumb-action[aria-pressed="true"]')).toHaveCount(1);

  await page.keyboard.press("Enter");
  await page.waitForURL(/\/watch\//);

  await page.keyboard.press("l");
  await expect(page.getByRole("button", { name: "Like" })).toHaveAttribute("aria-pressed", "true");
  // This video was saved from its card, so "w" here removes it again.
  await page.keyboard.press("w");
  await expect(page.getByRole("button", { name: "Watch later" })).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("h");
  await page.waitForURL((url) => url.pathname === "/");
  expect(consoleErrors).toEqual([]);
});

test("? lists the shortcuts, and letters typed into search are not shortcuts", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(async () => {
    await page.keyboard.press("?");
    await expect(dialog).toBeVisible({ timeout: 500 });
  }).toPass();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  await page.keyboard.press("/");
  await page.keyboard.type("hj");
  await expect(page).toHaveURL((url) => url.pathname === "/");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Results for “hj”" })).toBeVisible();
  await expect(page).toHaveTitle("hj · Search · NBATube");
});
