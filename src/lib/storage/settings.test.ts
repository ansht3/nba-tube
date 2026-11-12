// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { STORAGE_KEYS } from "./keys";
import { DEFAULT_SETTINGS, SETTINGS_BOOT_SCRIPT, applySettings, parseSettings, type Settings } from "./settings";

describe("parseSettings", () => {
  it("returns the defaults when nothing usable is stored", () => {
    for (const stored of [null, undefined, "dark", 7, []]) expect(parseSettings(stored)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid choices", () => {
    const stored: Settings = { theme: "dark", density: "compact", teamIds: ["LAL", "BOS"], hiddenSections: ["pregame"], historyEnabled: false };
    expect(parseSettings(stored)).toEqual(stored);
  });

  it("replaces each invalid field with its default and keeps the rest", () => {
    const stored = { theme: "neon", density: "compact", teamIds: "LAL", hiddenSections: [1, 2], historyEnabled: "no" };
    expect(parseSettings(stored)).toEqual({ ...DEFAULT_SETTINGS, density: "compact" });
  });

  it("drops unknown teams and sections, and repeats", () => {
    const stored = { teamIds: ["LAL", "SEA", "LAL", 5], hiddenSections: ["pregame", "comments", "pregame"] };
    const settings = parseSettings(stored);
    expect(settings.teamIds).toEqual(["LAL"]);
    expect(settings.hiddenSections).toEqual(["pregame"]);
  });
});

describe("applySettings", () => {
  it("resolves the system theme from the device preference", () => {
    const root = document.createElement("html");
    applySettings(DEFAULT_SETTINGS, root, true);
    expect(root.dataset.theme).toBe("dark");
    applySettings(DEFAULT_SETTINGS, root, false);
    expect(root.dataset.theme).toBe("light");
  });

  it("lets an explicit theme override the device preference", () => {
    const root = document.createElement("html");
    applySettings({ ...DEFAULT_SETTINGS, theme: "light" }, root, true);
    expect(root.dataset.theme).toBe("light");
    applySettings({ ...DEFAULT_SETTINGS, theme: "dark" }, root, false);
    expect(root.dataset.theme).toBe("dark");
  });

  it("exposes density and hidden sections to the stylesheet", () => {
    const root = document.createElement("html");
    applySettings({ ...DEFAULT_SETTINGS, density: "compact", hiddenSections: ["pregame", "interviews"] }, root, false);
    expect(root.dataset.density).toBe("compact");
    expect(root.dataset.hide).toBe("pregame interviews");
  });
});

describe("the boot script", () => {
  function boot(stored: string | null, prefersDark: boolean) {
    localStorage.clear();
    if (stored !== null) localStorage.setItem(STORAGE_KEYS.settings, stored);
    window.matchMedia = ((query: string) => ({ matches: prefersDark, media: query })) as unknown as typeof window.matchMedia;
    for (const key of Object.keys(document.documentElement.dataset)) delete document.documentElement.dataset[key];
    new Function(SETTINGS_BOOT_SCRIPT)();
    return { ...document.documentElement.dataset };
  }

  it("applies the same attributes as applySettings for stored settings", () => {
    const settings: Settings = { theme: "dark", density: "compact", teamIds: [], hiddenSections: ["pregame"], historyEnabled: true };
    const expected = document.createElement("html");
    applySettings(settings, expected, false);
    expect(boot(JSON.stringify(settings), false)).toEqual({ ...expected.dataset });
  });

  it("follows the device preference when nothing is stored", () => {
    expect(boot(null, true)).toEqual({ theme: "dark", density: "comfortable", hide: "" });
    expect(boot(null, false)).toEqual({ theme: "light", density: "comfortable", hide: "" });
  });

  it("falls back to the defaults on corrupted or hostile stored data", () => {
    expect(boot("{broken", false)).toEqual({ theme: "light", density: "comfortable", hide: "" });
    const hostile = JSON.stringify({ theme: "x", density: "y", hiddenSections: ['"]<script>', "pregame"] });
    expect(boot(hostile, false)).toEqual({ theme: "light", density: "comfortable", hide: "pregame" });
  });
});
