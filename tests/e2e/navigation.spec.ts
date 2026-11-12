import { builtCatalog, expect, openMenuIfMobile, test } from "./fixtures";

test("home shows official videos in labelled sections without errors", async ({ page, consoleErrors }) => {
  await page.goto("/");
  // Game highlights lead the page, postgame comes next.
  const shelves = await page.locator("main section h2").allTextContents();
  expect(shelves.slice(0, 2)).toEqual(["Latest game highlights", "Postgame"]);
  for (const label of await page.locator("section[aria-labelledby=shelf-games] article p.uppercase span:first-child").allTextContents()) {
    expect(label).toBe("Game highlights");
  }
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
  for (const path of ["/", "/browse/?sort=best", "/browse/?q=celtics", "/teams/", "/settings/", `/watch/${builtCatalog()[0].youtubeId}/`]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("every home quick link opens a populated page", async ({ page, consoleErrors }) => {
  await page.goto("/");
  const links = page.getByRole("navigation", { name: "Quick filters" }).getByRole("link");
  const count = await links.count();
  expect(count).toBeGreaterThan(5);
  for (let index = 0; index < count; index++) {
    await page.goto("/");
    const link = links.nth(index);
    const label = await link.textContent();
    await link.click();
    await expect(page.getByRole("heading", { level: 1 }), label!).toBeVisible();
    await expect(page.locator('main a[href^="/watch/"], main a[href^="/teams/"]').first(), label!).toBeVisible();
  }
  expect(consoleErrors).toEqual([]);
});
