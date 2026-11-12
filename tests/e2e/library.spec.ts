import { builtCatalog, expect, test } from "./fixtures";

const video = () => builtCatalog()[0];

test("liking a video lists it on Liked and survives a reload", async ({ page }) => {
  await page.goto(`/watch/${video().youtubeId}/`);
  await page.getByRole("button", { name: "Like" }).click();
  await expect(page.getByRole("button", { name: "Liked" })).toHaveAttribute("aria-pressed", "true");

  await page.goto("/liked/");
  await page.reload();
  await expect(page.getByText(video().title)).toBeVisible();

  await page.getByRole("button", { name: `Remove from Liked: ${video().title}` }).click();
  await expect(page.getByText("No liked videos yet")).toBeVisible();
});

test("watch later from a card, without duplicates", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button", { name: /^Save to Watch later:/ }).first();
  const name = (await button.getAttribute("aria-label"))!.replace("Save to Watch later: ", "");
  await button.click();

  await page.goto(`/watch/${builtCatalog().find((entry) => entry.title === name)!.youtubeId}/`);
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  await page.goto("/watch-later/");
  await expect(page.getByText(name, { exact: true })).toHaveCount(1);
  await expect(page.getByText("1 video")).toBeVisible();
});

test("opening a video records history, and history can be cleared", async ({ page }) => {
  await page.goto(`/watch/${video().youtubeId}/`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto(`/watch/${video().youtubeId}/`);

  await page.goto("/history/");
  await expect(page.getByText(video().title, { exact: true })).toHaveCount(1);

  await page.getByRole("button", { name: "Clear history" }).click();
  await page.getByRole("button", { name: "Yes, clear" }).click();
  await expect(page.getByText("No watch history")).toBeVisible();
});

test("paused history records nothing", async ({ page }) => {
  await page.goto("/settings/");
  await page.getByLabel("Record videos I open").uncheck();
  await page.goto(`/watch/${video().youtubeId}/`);
  await page.goto("/history/");
  await expect(page.getByText("No watch history")).toBeVisible();
});

test("playlists: create, add, rename, remove and delete", async ({ page }) => {
  await page.goto("/playlists/");
  await page.getByLabel("New playlist").fill("Finals");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("link", { name: /Finals/ })).toBeVisible();

  // A duplicate name is refused with a message.
  await page.getByLabel("New playlist").fill("finals");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "already have a playlist" })).toBeVisible();

  await page.goto(`/watch/${video().youtubeId}/`);
  await page.getByRole("button", { name: "Save to playlist" }).click();
  await page.getByRole("checkbox", { name: "Finals" }).check();
  await page.getByRole("button", { name: "Close" }).click();

  await page.goto("/playlists/");
  await page.getByRole("link", { name: /Finals/ }).click();
  await expect(page.getByText(video().title)).toBeVisible();

  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("Playlist name").fill("Finals 2027");
  await page.getByRole("button", { name: "Save name" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Finals 2027" })).toBeVisible();

  await page.getByRole("button", { name: `Remove from playlist: ${video().title}` }).click();
  await expect(page.getByText("This playlist is empty")).toBeVisible();

  await page.goto("/playlists/");
  await page.getByRole("button", { name: "Delete playlist Finals 2027" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByText("No playlists yet")).toBeVisible();
});

test("a saved video that left the catalog links to YouTube instead of a dead page", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("nbatube:v1:liked", JSON.stringify([{ id: "zzzzzzzzzzz", title: "An old recap", channelTitle: "NBA", savedAt: 1 }])),
  );
  await page.goto("/liked/");
  await expect(page.getByText("No longer in the catalog. Opens on YouTube.")).toBeVisible();
  await expect(page.getByRole("link", { name: /An old recap/ })).toHaveAttribute("href", "https://www.youtube.com/watch?v=zzzzzzzzzzz");
});

test("corrupted local data does not break the page", async ({ page, consoleErrors }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("nbatube:v1:liked", "{not json");
    localStorage.setItem("nbatube:v1:playlists", JSON.stringify([{ id: 5 }, "x"]));
    localStorage.setItem("nbatube:v1:settings", JSON.stringify({ theme: 42 }));
  });
  for (const path of ["/liked/", "/playlists/", "/settings/"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
  expect(consoleErrors).toEqual([]);
});
