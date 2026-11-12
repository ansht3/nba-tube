import { builtCatalog, expect, openMenuIfMobile, test } from "./fixtures";

test("home shows official videos in labelled sections without errors", async ({ page, consoleErrors }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Highlights" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Postgame" })).toBeVisible();
  expect(await page.locator("article").count()).toBeGreaterThan(8);
  expect(consoleErrors).toEqual([]);
});

test("every main navigation link opens its page", async ({ page, consoleErrors }) => {
  const pages = [
    ["Highlights", "Highlights"],
    ["Pregame", "Pregame"],
    ["Postgame", "Postgame"],
    ["Interviews", "Interviews"],
    ["Teams", "Teams"],
    ["Browse all", "Browse all videos"],
    ["Watch later", "Watch later"],
    ["Liked", "Liked"],
    ["History", "History"],
    ["Playlists", "Playlists"],
    ["Settings", "Settings"],
    ["About", "About NBATube"],
  ];
  await page.goto("/");
  for (const [link, heading] of pages) {
    await openMenuIfMobile(page);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: link, exact: true }).last().click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
  }
  expect(consoleErrors).toEqual([]);
});

test("a card opens its watch page with the official player and source", async ({ page }) => {
  await page.goto("/highlights/");
  const first = page.locator("article").first();
  const title = (await first.getByRole("heading").textContent())!.trim();
  await first.getByRole("link").click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
  const player = page.locator("iframe");
  await expect(player).toHaveAttribute("src", /^https:\/\/www\.youtube-nocookie\.com\/embed\/[\w-]{11}\?/);
  await expect(player).not.toHaveAttribute("src", /autoplay=1/);
  await expect(page.getByRole("link", { name: "Open on YouTube" })).toHaveAttribute("href", /^https:\/\/www\.youtube\.com\/watch\?v=/);
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Highlights" })).toBeVisible();
});

test("an unknown video id shows the not-found page", async ({ page }) => {
  const response = await page.goto("/watch/aaaaaaaaaaa/");
  expect(response?.status()).toBe(404);
  await expect(page.getByText("That page isn't here")).toBeVisible();
});

test("team pages list only that team's videos", async ({ page }) => {
  const catalog = builtCatalog();
  const team = catalog.find((video) => video.labels.teamIds.length > 0)!.labels.teamIds[0];
  const expected = catalog.filter((video) => video.labels.teamIds.includes(team)).length;

  await page.goto(`/teams/${team.toLowerCase()}/`);
  await expect(page.getByText(new RegExp(`^${expected} videos?, newest first`))).toBeVisible();
});

test("the page never scrolls sideways", async ({ page }) => {
  for (const path of ["/", "/browse/", "/teams/", "/settings/", `/watch/${builtCatalog()[0].youtubeId}/`]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
