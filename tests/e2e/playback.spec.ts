import { readFileSync } from "node:fs";
import { builtCatalog, expect, test } from "./fixtures";

const three = () => builtCatalog().slice(0, 3);
const saved = (v: { youtubeId: string; title: string; channelTitle: string }, n: number) => ({ id: v.youtubeId, title: v.title, channelTitle: v.channelTitle, savedAt: n });
const PLAYLIST = (videos: ReturnType<typeof three>) => [{ id: "pl1", name: "Test mix", createdAt: 1, items: videos.map((v, i) => saved(v, i + 1)) }];

/** Puts a playlist in this browser's storage before the page loads. */
async function seedPlaylist(page: import("@playwright/test").Page) {
  const playlists = PLAYLIST(three());
  await page.addInitScript((value) => localStorage.setItem("nbatube:v1:playlists", JSON.stringify(value)), playlists);
}

test("a playlist plays in order inside the site: Play all, Next and Previous, with real ends", async ({ page }) => {
  await seedPlaylist(page);
  const [a, b, c] = three();
  const navigated: string[] = [];
  page.on("framenavigated", (frame) => frame === page.mainFrame() && navigated.push(frame.url()));

  await page.goto("/playlists/?list=pl1");
  await page.getByRole("link", { name: "Play all" }).click();
  await expect(page).toHaveURL(`/watch/${a.youtubeId}/?list=pl1`);
  const panel = page.getByRole("region", { name: "Test mix" });
  await expect(panel).toContainText("1 of 3 videos");
  await expect(page.getByRole("navigation", { name: "Previous and next video" }).getByRole("link", { name: "Previous" })).toHaveCount(0);

  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(`/watch/${b.youtubeId}/?list=pl1`);
  await expect(panel).toContainText("2 of 3 videos");
  await expect(panel.locator('[aria-current="true"]')).toContainText(b.title);

  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(`/watch/${c.youtubeId}/?list=pl1`);
  await expect(page.getByText("End of playlist")).toBeVisible();
  await expect(page.getByRole("link", { name: "Next", exact: true })).toHaveCount(0);

  await page.getByRole("link", { name: "Previous" }).click();
  await expect(page).toHaveURL(`/watch/${b.youtubeId}/?list=pl1`);
  expect(navigated.every((url) => new URL(url).origin === new URL(page.url()).origin), "never left the site").toBe(true);
});

test("clicking a video in a playlist keeps the playlist playing", async ({ page }) => {
  await seedPlaylist(page);
  const [, b] = three();
  await page.goto("/playlists/?list=pl1");
  await page.getByRole("link", { name: new RegExp(b.title.slice(0, 30)) }).first().click();
  await expect(page).toHaveURL(`/watch/${b.youtubeId}/?list=pl1`);
});

test("nothing autoplays: the player never asks to start, in a playlist or out of one", async ({ page }) => {
  await seedPlaylist(page);
  for (const path of [`/watch/${three()[0].youtubeId}/`, `/watch/${three()[0].youtubeId}/?list=pl1`]) {
    await page.goto(path);
    const src = (await page.locator("iframe").getAttribute("src"))!;
    expect(src).toContain("youtube-nocookie.com/embed/");
    expect(new URL(src).searchParams.get("autoplay"), path).toBeNull();
  }
});

test("without a playlist, Next opens the first suggestion and Previous returns to what was watched", async ({ page }) => {
  const [a] = three();
  await page.goto(`/watch/${a.youtubeId}/`);
  // Visiting records it in history, which is what Previous reads.
  await expect.poll(() => page.evaluate(() => localStorage.getItem("nbatube:v1:history") ?? "")).toContain(a.youtubeId);
  const first = await page.locator("aside[aria-labelledby=related-heading] a").first().getAttribute("href");
  await page.getByRole("link", { name: "Next", exact: true }).click();
  await expect(page).toHaveURL(first!);
  await page.getByRole("link", { name: "Previous" }).click();
  await expect(page).toHaveURL(`/watch/${a.youtubeId}/`);
});

test("when a video ends, the next one is offered below the player and nothing navigates by itself", async ({ page }) => {
  const [a] = three();
  await page.goto(`/watch/${a.youtubeId}/`);
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent("nbatube:ended", { detail: { youtubeId: id } })), a.youtubeId);
  const offer = page.getByRole("status").filter({ hasText: "Video ended. Up next:" });
  await expect(offer).toBeVisible();
  await expect(offer.getByRole("link", { name: "Play next" })).toBeVisible();
  await page.waitForTimeout(1200);
  await expect(page).toHaveURL(`/watch/${a.youtubeId}/`);
  // It is below the player, not drawn over it.
  const player = (await page.locator("iframe").boundingBox())!;
  const offerBox = (await offer.boundingBox())!;
  expect(offerBox.y).toBeGreaterThanOrEqual(player.y + player.height - 1);
});

test("keyboard: n and p open the next and previous video in a playlist", async ({ page }) => {
  await seedPlaylist(page);
  const [a, b] = three();
  await page.goto(`/watch/${a.youtubeId}/?list=pl1`);
  await page.keyboard.press("n");
  await expect(page).toHaveURL(`/watch/${b.youtubeId}/?list=pl1`);
  await page.keyboard.press("p");
  await expect(page).toHaveURL(`/watch/${a.youtubeId}/?list=pl1`);
});

test("a card can be liked, saved for later and added to a playlist without opening the video", async ({ page }) => {
  await page.goto("/browse/");
  const card = page.locator("main article").first();
  const id = (await card.locator('a[href^="/watch/"]').first().getAttribute("href"))!.split("/")[2]!;
  const stored = (key: string) => page.evaluate((k) => localStorage.getItem(k) ?? "", `nbatube:v1:${key}`);

  await card.getByRole("button", { name: /^Like:/ }).click();
  await expect.poll(() => stored("liked")).toContain(id);
  await card.getByRole("button", { name: /^Watch later:/ }).click();
  await expect.poll(() => stored("watch-later")).toContain(id);

  await card.getByRole("button", { name: /^Add to playlist:/ }).click();
  const dialog = page.getByRole("dialog", { name: "Save to playlist" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("New playlist").fill("From a card");
  await dialog.getByRole("button", { name: "Create" }).click();
  await expect.poll(() => stored("playlists")).toContain(id);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/browse\/$/);
});

test("exporting a library and importing it in a fresh browser restores it, adds only, and refuses bad files", async ({ page, browser }, testInfo) => {
  const [a, b] = three();
  await page.addInitScript(([liked, playlists, history]) => {
    localStorage.setItem("nbatube:v1:liked", JSON.stringify(liked));
    localStorage.setItem("nbatube:v1:playlists", JSON.stringify(playlists));
    localStorage.setItem("nbatube:v1:history", JSON.stringify(history));
  }, [[saved(a, 5)], PLAYLIST([a, b]), [saved(b, 9)]] as const);
  await page.goto("/settings/");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export library" }).click();
  const file = testInfo.outputPath("library.json");
  await (await download).saveAs(file);
  const backup = JSON.parse(readFileSync(file, "utf8"));
  expect(backup).toMatchObject({ app: "nbatube", version: 1 });
  expect(backup.liked.map((v: { id: string }) => v.id)).toEqual([a.youtubeId]);
  expect(backup.playlists[0].items).toHaveLength(2);
  expect(backup.history, "history is only exported when asked for").toBeUndefined();

  const context = await browser.newContext(testInfo.project.use);
  const fresh = await context.newPage();
  await fresh.goto("/settings/");
  await fresh.getByLabel("Choose a library file to import").setInputFiles(file);
  await expect(fresh.getByRole("status").filter({ hasText: "Added" })).toContainText("1 liked");
  await fresh.goto("/liked/");
  await expect(fresh.locator("main").getByText(a.title).first()).toBeVisible();
  await fresh.goto("/playlists/?list=pl1");
  await expect(fresh.getByRole("heading", { name: "Test mix" })).toBeVisible();

  // Importing the same file again changes nothing.
  await fresh.goto("/settings/");
  await fresh.getByLabel("Choose a library file to import").setInputFiles(file);
  await expect(fresh.getByRole("status").filter({ hasText: "Nothing new" })).toBeVisible();

  // A file that is not a backup is refused with a reason, and changes nothing.
  await fresh.getByLabel("Choose a library file to import").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"hello":"world"}') });
  await expect(fresh.locator("main").getByRole("alert")).toContainText("not an NBATube backup");
  await context.close();
});
