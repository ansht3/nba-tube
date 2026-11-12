import { SECTIONS, type SectionId } from "@/catalog/content-types";
import { getTeam } from "@/catalog/teams";
import { STORAGE_KEYS } from "./keys";
import { createStore } from "./store";

export const THEMES = ["system", "light", "dark"] as const;
export const DENSITIES = ["comfortable", "compact"] as const;

export type Theme = (typeof THEMES)[number];
export type Density = (typeof DENSITIES)[number];

export interface Settings {
  theme: Theme;
  density: Density;
  /** Teams whose latest videos get their own shelf at the top of Home. */
  teamIds: string[];
  /** Sections the viewer chose not to see on Home. */
  hiddenSections: SectionId[];
  /** When false, opening a video is not recorded. */
  historyEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  density: "comfortable",
  teamIds: [],
  hiddenSections: [],
  historyEnabled: true,
};

function pick<Option extends string>(value: unknown, options: readonly Option[], fallback: Option): Option {
  return options.includes(value as Option) ? (value as Option) : fallback;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === "string"))];
}

/** Reads stored settings, replacing anything missing or invalid with its default. */
export function parseSettings(stored: unknown): Settings {
  const raw = typeof stored === "object" && stored !== null ? (stored as Record<string, unknown>) : {};
  const sectionIds = SECTIONS.map((section) => section.id as string);

  return {
    theme: pick(raw.theme, THEMES, DEFAULT_SETTINGS.theme),
    density: pick(raw.density, DENSITIES, DEFAULT_SETTINGS.density),
    teamIds: uniqueStrings(raw.teamIds).filter((id) => getTeam(id) !== undefined),
    hiddenSections: uniqueStrings(raw.hiddenSections).filter((id) => sectionIds.includes(id)) as SectionId[],
    historyEnabled: typeof raw.historyEnabled === "boolean" ? raw.historyEnabled : DEFAULT_SETTINGS.historyEnabled,
  };
}

export const settingsStore = createStore({ key: STORAGE_KEYS.settings, fallback: DEFAULT_SETTINGS, parse: parseSettings });

/**
 * Reflects the settings onto <html> as data attributes. The stylesheet does
 * the rest, so theme, density and hidden shelves never need a re-render.
 */
export function applySettings(settings: Settings, root: HTMLElement, systemPrefersDark: boolean) {
  const dark = settings.theme === "dark" || (settings.theme === "system" && systemPrefersDark);
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.density = settings.density;
  root.dataset.hide = settings.hiddenSections.join(" ");
}

/**
 * The same logic as applySettings, as a script that runs before the page is
 * painted. Without it, a visitor who chose the dark theme would see a white
 * flash on every page load. It is deliberately tiny and defensive: if anything
 * about storage fails, the defaults apply.
 */
export const SETTINGS_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,s={};try{s=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEYS.settings,
)}))||{}}catch(e){}var t=s.theme,k=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);d.dataset.theme=k?"dark":"light";d.dataset.density=s.density==="compact"?"compact":"comfortable";d.dataset.hide=Array.isArray(s.hiddenSections)?s.hiddenSections.filter(function(x){return /^[a-z]+$/.test(x)}).join(" "):""}catch(e){}})()`;
