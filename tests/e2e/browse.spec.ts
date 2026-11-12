import { builtCatalog, expect, openFilters, test } from "./fixtures";

test("search from the header finds matching videos and the reset clears it", async ({ page }) => {
  const target = builtCatalog().find((video) => video.channelTitle !== "NBA")!;
  const word = target.channelTitle.split(" ").pop()!;

  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search videos" }).fill(word);
  await page.getByRole("searchbox", { name: "Search videos" }).press("Enter");

  await expect(page).toHaveURL(new RegExp(`/browse/\\?q=${word}`));
  await expect(page.getByRole("status").filter({ hasText: /videos?$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove filter: “${word}”` })).toBeVisible();
  // Search results are rows, each linking to a watch page.
  expect(await page.locator('main ul li a[href^="/watch/"]').count()).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).toHaveURL(/\/browse\/$/);
  await expect(page.getByRole("searchbox", { name: "Search videos" })).toHaveValue("");
});

test("a search with no match says so", async ({ page }) => {
  await page.goto("/browse/?q=zzzzqqqq");
  await expect(page.getByText("No videos match")).toBeVisible();
});

test("filters narrow the list, stay in the URL and survive a reload", async ({ page }) => {
  await page.goto("/browse/");
  await openFilters(page);
  await page.getByRole("group", { name: "Section" }).getByRole("button", { name: "Postgame" }).click();
  await expect(page).toHaveURL(/section=postgame/);
  // Choosing an option closes the panel so the results are in view.
  await expect(page.getByRole("button", { name: "Filters (1)" })).toHaveAttribute("aria-expanded", "false");
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove filter: Postgame" })).toBeVisible();
  await openFilters(page);
  await expect(page.getByRole("group", { name: "Section" }).getByRole("button", { name: "Postgame" })).toHaveAttribute("aria-pressed", "true");

  const labels = await page.locator("article p.uppercase span:first-child").allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).toMatch(/Postgame|Coach/);
});

test("choosing an active option again removes that filter", async ({ page }) => {
  await page.goto("/browse/?type=GAME_HIGHLIGHTS");
  await openFilters(page);
  await page.getByRole("group", { name: "Type" }).getByRole("button", { name: "Game highlights" }).click();
  await expect(page).toHaveURL(/\/browse\/$/);
});

test("the team filter shows only that team's videos", async ({ page }) => {
  await page.goto("/browse/");
  await openFilters(page);
  await page.getByRole("group", { name: "Team" }).getByRole("button", { name: "Boston Celtics" }).click();
  await expect(page).toHaveURL(/team=BOS/);
  const tags = await page.locator("article p.uppercase").allTextContents();
  expect(tags.length).toBeGreaterThan(0);
  for (const tag of tags) expect(tag).toContain("BOS");
});

test("sorting: best first explains itself, oldest first reverses latest", async ({ page }) => {
  await page.goto("/browse/");
  const latest = await page.locator("article h3").first().textContent();
  await openFilters(page);
  await page.getByRole("group", { name: "Sort by" }).getByRole("button", { name: "Oldest first" }).click();
  await expect(page).toHaveURL(/sort=oldest/);
  await expect(page.locator("article h3").first()).not.toHaveText(latest!);

  await openFilters(page);
  await page.getByRole("group", { name: "Sort by" }).getByRole("button", { name: "Best first" }).click();
  await expect(page.getByText(/Game recaps first/)).toBeVisible();
  await expect(page.locator("article p.uppercase span:first-child").first()).toHaveText("Game highlights");
});

test("the upload date filter is offered and applied", async ({ page }) => {
  await page.goto("/browse/");
  await openFilters(page);
  await page.getByRole("group", { name: "Upload date" }).getByRole("button", { name: "This month" }).click();
  await expect(page).toHaveURL(/date=month/);
  await expect(page.getByRole("button", { name: "Remove filter: This month" })).toBeVisible();
});

test("search results are listed as rows", async ({ page }) => {
  await page.goto("/browse/?q=highlights");
  await expect(page.locator("main ul li a h3").first()).toBeVisible();
  expect(await page.locator("main article").count()).toBe(0);
});

test("unknown filter values in a link are ignored", async ({ page, consoleErrors }) => {
  await page.goto("/browse/?team=SEA&section=nope&type=<script>&date=forever&sort=random");
  await expect(page.getByRole("button", { name: "Filters", exact: true })).toBeVisible();
  expect(await page.locator("article").count()).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});
