import { readFileSync } from "node:fs";
import { test as base, expect, type Page } from "@playwright/test";

// The tests never reach YouTube: thumbnails get a blank image, the player API
// script is an empty file and the embed is a stub page.
const PIXEL = Buffer.from("R0lGODlhAQABAAAAACw=", "base64");

export interface CatalogVideo {
  youtubeId: string;
  title: string;
  channelTitle: string;
  labels: { contentType: string; teamIds: string[] };
}

/** The catalog the site under test was built from. */
export function builtCatalog(): CatalogVideo[] {
  return JSON.parse(readFileSync("out/catalog.json", "utf8")).videos;
}

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.route(/ytimg\.com/, (route) => route.fulfill({ body: PIXEL, contentType: "image/gif" }));
    await page.route(/youtube\.com\/iframe_api/, (route) => route.fulfill({ body: "", contentType: "text/javascript" }));
    await page.route(/youtube-nocookie\.com/, (route) => route.fulfill({ body: "<html><body>player</body></html>", contentType: "text/html" }));
    await use(errors);
  },
});

export { expect };

export async function openMenuIfMobile(page: Page) {
  const menu = page.getByRole("button", { name: "Open menu" });
  if (await menu.isVisible()) await menu.click();
}
