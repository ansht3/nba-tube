import AxeBuilder from "@axe-core/playwright";
import { builtCatalog, expect, test } from "./fixtures";

const PAGES = ["/", "/highlights/", "/browse/", "/teams/", "/teams/bos/", "/settings/", "/playlists/", "/liked/", "/about/", "/privacy/"];

for (const theme of ["light", "dark"] as const) {
  test(`no serious accessibility violations in the ${theme} theme`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    for (const path of [...PAGES, `/watch/${builtCatalog()[0].youtubeId}/`]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      // The player is YouTube's own frame and is stubbed in tests.
      const results = await new AxeBuilder({ page }).exclude("iframe").analyze();
      const serious = results.violations
        .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
        .map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).slice(0, 3).join(", ")}`);
      expect(serious, path).toEqual([]);
    }
  });
}
