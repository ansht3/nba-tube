"use client";

import type { ReactNode } from "react";
import { SECTIONS, type SectionId } from "@/catalog/content-types";
import { TEAMS, teamFullName } from "@/catalog/teams";
import { historyStore } from "@/lib/storage/library";
import { DENSITIES, THEMES, settingsStore, type Settings } from "@/lib/storage/settings";
import { useStore } from "@/lib/storage/use-store";
import { StorageNotice } from "./StorageNotice";

const THEME_LABELS = { system: "Match device", light: "Light", dark: "Dark" } as const;
const DENSITY_LABELS = { comfortable: "Comfortable", compact: "Compact" } as const;

function Group({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-line py-6">
      <legend className="float-left w-full font-semibold">{title}</legend>
      <p className="clear-both pt-1 text-sm text-muted">{description}</p>
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

function Choice({ name, value, checked, onChange, children }: { name: string; value: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="size-5 accent-(--accent)" />
      {children}
    </label>
  );
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

export function SettingsView() {
  const settings = useStore(settingsStore);
  const history = useStore(historyStore);
  const change = (patch: Partial<Settings>) => settingsStore.update((current) => ({ ...current, ...patch }));

  return (
    <div className="max-w-2xl">
      <StorageNotice store={settingsStore} />

      <Group title="Theme" description="Dark mode follows your device unless you pick one here.">
        {THEMES.map((theme) => (
          <Choice key={theme} name="theme" value={theme} checked={settings.theme === theme} onChange={() => change({ theme })}>
            {THEME_LABELS[theme]}
          </Choice>
        ))}
      </Group>

      <Group title="Layout" description="Compact fits more videos on the screen.">
        {DENSITIES.map((density) => (
          <Choice key={density} name="density" value={density} checked={settings.density === density} onChange={() => change({ density })}>
            {DENSITY_LABELS[density]}
          </Choice>
        ))}
      </Group>

      <Group title="Home sections" description="Choose which shelves appear on Home. The section pages stay available from the menu.">
        {SECTIONS.map((section) => (
          <label key={section.id} className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={!settings.hiddenSections.includes(section.id)}
              onChange={() => change({ hiddenSections: toggle<SectionId>(settings.hiddenSections, section.id) })}
              className="size-5 accent-(--accent)"
            />
            {section.title}
          </label>
        ))}
      </Group>

      <Group title="Your teams" description="The newest videos from these teams get their own shelf at the top of Home.">
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {TEAMS.map((team) => (
            <label key={team.id} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={settings.teamIds.includes(team.id)}
                onChange={() => change({ teamIds: toggle(settings.teamIds, team.id) })}
                className="size-5 accent-(--accent)"
              />
              {teamFullName(team)}
            </label>
          ))}
        </div>
        {settings.teamIds.length > 0 && (
          <button type="button" className="link mt-3 cursor-pointer text-sm" onClick={() => change({ teamIds: [] })}>
            Clear all teams
          </button>
        )}
      </Group>

      <Group title="Watch history" description="History is kept only in this browser. Pausing it stops new entries without deleting old ones.">
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={settings.historyEnabled} onChange={() => change({ historyEnabled: !settings.historyEnabled })} className="size-5 accent-(--accent)" />
          Record videos I open
        </label>
        <button type="button" className="pill mt-3 disabled:opacity-50" disabled={history.length === 0} onClick={() => historyStore.set([])}>
          {history.length === 0 ? "History is empty" : `Clear history (${history.length})`}
        </button>
      </Group>
    </div>
  );
}
