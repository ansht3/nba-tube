import { builtCatalog, expect, test } from "./fixtures";

test("search from the header finds matching videos and the reset clears it", async ({ page }) => {
  const target = builtCatalog().find((video) => video.channelTitle !== "NBA")!;
  const word = target.channelTitle.split(" ").pop()!;

  await page.goto("/");
  await page.getByRole("searchbox", { name: "Search videos" }).fill(word);
  await page.getByRole("searchbox", { name: "Search videos" }).press("Enter");

  await expect(page).toHaveURL(new RegExp(`/browse/\\?q=${word}`));
  await expect(page.getByRole("status").filter({ hasText: /videos?$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: `Remove filter: “${word}”` })).toBeVisible();
  const count = await page.locator("article").count();
  expect(count).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/browse\/$/);
  await expect(page.getByRole("searchbox", { name: "Search videos" })).toHaveValue("");
});

test("a search with no match says so", async ({ page }) => {
  await page.goto("/browse/?q=zzzzqqqq");
  await expect(page.getByText("No videos match")).toBeVisible();
});

test("filters narrow the list, stay in the URL and survive a reload", async ({ page }) => {
  await page.goto("/browse/");
  await page.getByLabel("Section").selectOption("postgame");
  await expect(page).toHaveURL(/section=postgame/);
  await page.reload();
  await expect(page.getByLabel("Section")).toHaveValue("postgame");

  const labels = await page.locator("article p.uppercase span:first-child").allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).toMatch(/Postgame|Coach/);
});

test("the team filter shows only that team's videos", async ({ page }) => {
  await page.goto("/browse/?team=BOS");
  await expect(page.getByLabel("Team")).toHaveValue("BOS");
  const tags = await page.locator("article p.uppercase").allTextContents();
  for (const tag of tags) expect(tag).toContain("BOS");
});

test("unknown filter values in a link are ignored", async ({ page, consoleErrors }) => {
  await page.goto("/browse/?team=SEA&section=nope&type=<script>");
  await expect(page.getByLabel("Team")).toHaveValue("");
  expect(await page.locator("article").count()).toBeGreaterThan(0);
  expect(consoleErrors).toEqual([]);
});
