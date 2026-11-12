import { builtCatalog, expect, test } from "./fixtures";

test("a newer catalog offers its new videos without a manual reload", async ({ page }) => {
  await page.goto("/");
  const newest = builtCatalog()[0];
  // The live catalog gains one upload published after everything in this build.
  await page.route("**/catalog.json", async (route) => {
    const response = await route.fetch();
    const catalog = await response.json();
    const fresh = { ...newest, youtubeId: "zzzzzzzzzzz", publishedAt: new Date(Date.now() + 60_000).toISOString() };
    await route.fulfill({ response, json: { ...catalog, videos: [fresh, ...catalog.videos] } });
  });

  const notice = page.getByRole("status").filter({ hasText: "new video" });
  // Coming back to the tab triggers a check.
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(notice).toHaveText(/1 new video/, { timeout: 1000 });
  }).toPass();
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toBeHidden();
});

test("cards show YouTube-style ages and home leads with a selected All chip", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main article time").first()).toHaveText(/ago$|^just now$/);
  await expect(page.getByRole("navigation", { name: "Quick filters" }).getByRole("link", { name: "All", exact: true })).toHaveAttribute("aria-current", "page");
});
