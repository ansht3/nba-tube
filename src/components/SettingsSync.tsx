"use client";

import { useEffect } from "react";
import { applySettings, settingsStore } from "@/lib/storage/settings";

/**
 * Keeps <html> in step with the settings after the page has loaded: when the
 * viewer changes a setting, when another tab does, or when the device switches
 * between light and dark. The first paint is handled by the boot script.
 */
export function SettingsSync() {
  useEffect(() => {
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => applySettings(settingsStore.get(), document.documentElement, systemDark.matches);

    apply();
    const unsubscribe = settingsStore.subscribe(apply);
    systemDark.addEventListener("change", apply);
    return () => {
      unsubscribe();
      systemDark.removeEventListener("change", apply);
    };
  }, []);

  return null;
}
