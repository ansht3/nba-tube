import { STORAGE_KEYS } from "./keys";
import { createStore } from "./store";

/** Whether the desktop sidebar shows labels ("full") or just an icon rail ("mini"). */
export type SidebarMode = "full" | "mini";

export const sidebarStore = createStore<SidebarMode>({
  key: STORAGE_KEYS.sidebar,
  fallback: "full",
  parse: (stored) => (stored === "mini" ? "mini" : "full"),
});

/** Sets the attribute the stylesheet uses to size the sidebar and the content beside it. */
export function applySidebar(mode: SidebarMode, root: HTMLElement) {
  root.dataset.sidebar = mode;
}

/** Applied before first paint, like the settings, so a collapsed sidebar never flashes open. */
export const SIDEBAR_BOOT_SCRIPT = `(function(){try{document.documentElement.dataset.sidebar=JSON.parse(localStorage.getItem(${JSON.stringify(
  STORAGE_KEYS.sidebar,
)}))==="mini"?"mini":"full"}catch(e){document.documentElement.dataset.sidebar="full"}})()`;
