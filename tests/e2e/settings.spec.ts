import { expect, test } from "./fixtures";

test("the dark theme applies, persists and loads before paint", async ({ page }) => {
  await page.goto("/settings/");
  await page.getByRole("radio", { name: "Dark" }).check();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(background).toBe("rgb(13, 14, 16)");
});

test("the header toggle switches theme", async ({ page }) => {
  await page.goto("/");
  const before = await page.locator("html").getAttribute("data-theme");
  await page.getByRole("button", { name: "Switch between light and dark theme" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", before!);
});

test("hiding a home section removes its shelf", async ({ page }) => {
  await page.goto("/settings/");
  await page.getByRole("group", { name: "Home sections" }).getByLabel("Postgame").uncheck();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2, name: "Postgame" })).toBeHidden();
  await expect(page.getByRole("heading", { level: 2, name: "Latest game highlights" })).toBeVisible();
});

test("picking a team adds its shelf to home", async ({ page }) => {
  await page.goto("/settings/");
  await page.getByRole("group", { name: "Your teams" }).getByLabel("Denver Nuggets").check();
  await page.goto("/");
  const shelf = page.getByRole("region", { name: "Your teams" });
  await expect(shelf).toBeVisible();
  for (const tag of await shelf.locator("article p.uppercase").allTextContents()) expect(tag).toContain("DEN");
});

test("compact density shows more cards per row", async ({ page, isMobile }) => {
  test.skip(isMobile, "One column either way on a narrow phone in comfortable mode");
  await page.goto("/highlights/");
  const columns = () => page.locator(".video-grid").first().evaluate((grid) => getComputedStyle(grid).gridTemplateColumns.split(" ").length);
  const comfortable = await columns();
  await page.goto("/settings/");
  await page.getByRole("radio", { name: "Compact" }).check();
  await page.goto("/highlights/");
  expect(await columns()).toBeGreaterThan(comfortable);
});
