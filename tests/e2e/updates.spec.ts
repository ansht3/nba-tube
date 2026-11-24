import { builtCatalog, expect, test } from "./fixtures";

const FIVE_MINUTES_AND_JITTER = "07:00";

/** Pretends ingestion published one more video: a new version, and one video newer than the page's newest. */
async function publishNewVideo(page: import("@playwright/test").Page) {
  const fresh = { ...builtCatalog()[0], youtubeId: "zzzzzzzzzzz", publishedAt: new Date(Date.now() + 60_000).toISOString() };
  await page.route("**/api/version", (route) => route.fulfill({ json: { version: "v-new", newestId: fresh.youtubeId, newestPublishedAt: fresh.publishedAt, total: 999 } }));
  await page.route("**/api/updates**", (route) => route.fulfill({ json: { videos: [fresh], count: 1, hasMore: false, reset: false, version: "v-new" } }));
}

/**
 * Advances the fake clock until the new-videos notice appears. The poll timer exists only once the page
 * has hydrated, which on a slow machine is after goto returns, and advancing before then schedules nothing.
 */
async function waitForNotice(page: import("@playwright/test").Page) {
  const notice = page.getByRole("status").filter({ hasText: "new video" });
  await expect.poll(async () => (await page.clock.fastForward(FIVE_MINUTES_AND_JITTER), await notice.count()), { timeout: 15_000 }).toBeGreaterThan(0);
  return notice;
}

test("new videos are offered after a published version, found with tiny requests and no catalog download", async ({ page }) => {
  await page.clock.install();
  const paths: string[] = [];
  page.on("request", (request) => paths.push(new URL(request.url()).pathname));
  await publishNewVideo(page);
  await page.goto("/");
  // The poll timer exists only once the page has hydrated, which on a slow machine is after goto returns.
  // Advancing the fake clock before then schedules nothing, so keep advancing until the first check is seen.
  await expect.poll(async () => (await page.clock.fastForward(FIVE_MINUTES_AND_JITTER), paths.includes("/api/version")), { timeout: 15_000 }).toBe(true);

  const notice = page.getByRole("status").filter({ hasText: "new video" });
  await expect(notice).toHaveText(/1 new video/);
  expect(paths).toContain("/api/version");
  expect(paths.some((path) => path.startsWith("/api/updates"))).toBe(true);
  expect(paths, "the whole catalog is never downloaded to check").not.toContain("/catalog.json");
  await notice.getByRole("button", { name: "Dismiss" }).click();
  await expect(notice).toBeHidden();
});

test("a hidden tab does no polling, and checks when it becomes visible again", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __hidden: boolean }).__hidden = true;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => (window as unknown as { __hidden: boolean }).__hidden });
  });
  await page.clock.install();
  const versionRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/version") versionRequests.push(request.url());
  });
  await publishNewVideo(page);
  await page.goto("/");
  await page.clock.fastForward("20:00");
  expect(versionRequests, "no requests while hidden").toHaveLength(0);

  // Becoming visible checks only once the page's listener exists, and only if a minute has passed since the page's
  // last check. On a slow machine the page hydrates after the jump above, so move time on again before each signal,
  // as a person returning to the tab after a while would.
  await expect
    .poll(
      async () => {
        await page.clock.fastForward("02:00");
        await page.evaluate(() => {
          (window as unknown as { __hidden: boolean }).__hidden = false;
          document.dispatchEvent(new Event("visibilitychange"));
        });
        return versionRequests.length;
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.getByRole("status").filter({ hasText: "new video" })).toHaveText(/1 new video/);
  expect(versionRequests.length).toBeGreaterThan(0);
});

test("Show refreshes in place without reloading the page", async ({ page }) => {
  await page.clock.install();
  await publishNewVideo(page);
  await page.goto("/");
  await page.evaluate(() => ((window as unknown as { __survives: boolean }).__survives = true));
  const notice = await waitForNotice(page);
  await notice.getByRole("button", { name: "Show" }).click();
  await expect(notice).toBeHidden();
  expect(await page.evaluate(() => (window as unknown as { __survives?: boolean }).__survives), "the document was not reloaded").toBe(true);
});

test("on a watch page the notice never touches the player: it only links to the new videos in a new tab", async ({ page }) => {
  await page.clock.install();
  await publishNewVideo(page);
  await page.goto(`/watch/${builtCatalog()[0].youtubeId}/`);
  const player = page.locator("iframe");
  await expect(player).toBeVisible();
  await page.evaluate(() => ((window as unknown as { __survives: boolean }).__survives = true));
  const notice = await waitForNotice(page);
  await expect(notice).toHaveText(/1 new video/);
  await expect(notice.getByRole("button", { name: "Show" })).toHaveCount(0);
  const link = notice.getByRole("link", { name: /new tab/ });
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("href", "/browse/");
  expect(new URL(page.url()).pathname).toBe(`/watch/${builtCatalog()[0].youtubeId}/`);
  await expect(player).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __survives?: boolean }).__survives)).toBe(true);
});

test("cards show YouTube-style ages and home leads with a selected All chip", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main article time").first()).toHaveText(/ago$|^just now$/);
  await expect(page.getByRole("navigation", { name: "Quick filters" }).getByRole("link", { name: "All", exact: true })).toHaveAttribute("aria-current", "page");
});
