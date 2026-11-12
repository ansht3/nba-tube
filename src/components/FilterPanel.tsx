"use client";

import { CONTENT_TYPES, CONTENT_TYPE_LABELS, SECTIONS } from "@/catalog/content-types";
import { TEAMS } from "@/catalog/teams";
import { DURATION_BUCKETS, UPLOAD_WINDOWS, type BrowseFilters } from "@/lib/browse";

interface Option {
  value: string;
  label: string;
  title?: string;
}

interface Group {
  key: keyof BrowseFilters;
  title: string;
  options: Option[];
  /** Long lists scroll inside their column. "columns" also splits them in two. */
  long?: "columns" | "scroll";
}

interface Props {
  filters: BrowseFilters;
  sources: { channelId: string; name: string }[];
  /** Duration only exists in catalogs built with the Data API. */
  hasDurations: boolean;
  onChange: (key: keyof BrowseFilters, value: string) => void;
}

/**
 * The expanded filter panel: one column per filter, every option a toggle.
 * Choosing the active option again clears it. The order is a chip row
 * beside the panel, not part of it.
 */
export function FilterPanel({ filters, sources, hasDurations, onChange }: Props) {
  const groups: Group[] = [
    { key: "date", title: "Upload date", options: UPLOAD_WINDOWS.map((window) => ({ value: window.id, label: window.label })) },
    { key: "section", title: "Section", options: SECTIONS.map((section) => ({ value: section.id, label: section.title })) },
    { key: "type", title: "Type", options: CONTENT_TYPES.map((type) => ({ value: type, label: CONTENT_TYPE_LABELS[type] })) },
    ...(hasDurations || filters.duration
      ? [{ key: "duration" as const, title: "Duration", options: DURATION_BUCKETS.map((bucket) => ({ value: bucket.id, label: bucket.label })) }]
      : []),
    { key: "team", title: "Team", long: "columns", options: TEAMS.map((team) => ({ value: team.id, label: `${team.city} ${team.name}` })) },
    { key: "source", title: "Source", long: "scroll", options: sources.map((source) => ({ value: source.channelId, label: source.name })) },
  ];

  return (
    <div
      // On wide screens every filter gets a column and the last (Source) takes the rest of the row.
      style={{ "--columns": groups.length - 1 } as React.CSSProperties}
      className="grid grid-cols-2 gap-x-8 gap-y-6 border-b border-line pb-6 pt-4 sm:grid-cols-3 lg:grid-cols-[repeat(var(--columns),minmax(8.5rem,auto))_1fr]"
    >
      {groups.map((group) => (
        <fieldset key={group.key} className={group.long === "columns" ? "col-span-2 sm:col-span-3 lg:col-span-1" : ""}>
          <legend className="mb-2 w-full border-b border-line pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            {group.title}
          </legend>
          <ul
            className={
              group.long === "columns"
                ? "max-h-64 columns-2 gap-x-6 overflow-y-auto pr-1 sm:columns-3 lg:columns-2"
                : group.long === "scroll"
                  ? "max-h-64 overflow-y-auto pr-1"
                  : ""
            }
          >
            {group.options.map((option) => {
              const active = filters[group.key] === option.value;
              // Choosing the active option again removes that filter.
              const clears = active;
              return (
                <li key={option.value} className="break-inside-avoid">
                  <button
                    type="button"
                    aria-pressed={active}
                    title={clears ? "Remove this filter" : option.title}
                    onClick={() => onChange(group.key, clears ? "" : option.value)}
                    className={`block min-h-9 w-full cursor-pointer py-1.5 text-left text-sm ${
                      active ? "font-semibold text-text" : "text-muted hover:text-text"
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
    </div>
  );
}
