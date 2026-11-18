import AxeBuilder from "@axe-core/playwright";
import { builtCatalog, expect, test } from "./fixtures";

const PAGES = ["/", "/highlights/", "/browse/", "/teams/", "/teams/bos/", "/settings/", "/playlists/", "/liked/", "/about/", "/privacy/"];

const paths = () => [...PAGES, `/watch/${builtCatalog()[0].youtubeId}/`];

// One test per page and theme: each gets its own time budget, and a failure names the page.
for (const theme of ["light", "dark"] as const) {
  for (const path of paths()) {
    test(`no serious accessibility violations: ${path} (${theme} theme)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // The player is YouTube's own frame and is stubbed in tests.
      const results = await new AxeBuilder({ page }).exclude("iframe").analyze();
      const serious = results.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`);
      expect(serious).toEqual([]);
    });
  }
}
