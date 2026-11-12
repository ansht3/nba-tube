"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type ReactNode } from "react";
import { CONTENT_TYPES, CONTENT_TYPE_LABELS, SECTIONS } from "@/catalog/content-types";
import type { Video } from "@/catalog/schema";
import { TEAMS, teamFullName } from "@/catalog/teams";
import {
  DURATION_BUCKETS,
  NO_FILTERS,
  buildSearchIndex,
  filterVideos,
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  type BrowseFilters,
} from "@/lib/browse";
import { pluralize } from "@/lib/format";
import { useCatalog } from "@/lib/use-catalog";
import { EmptyState } from "./EmptyState";
import { CloseIcon, SettingsIcon } from "./icons";
import { VideoGrid } from "./VideoCard";

const PAGE_SIZE = 48;

interface Props {
  /** The newest videos, rendered on the server and shown until the full catalog has loaded. */
  initial: Video[];
  total: number;
  /** Channels that currently have videos, for the source filter. */
  sources: { channelId: string; name: string }[];
}

interface SelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}

function FilterSelect({ label, value, onChange, children }: SelectProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-muted">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="field w-full min-w-0 pr-8">
        {children}
      </select>
    </label>
  );
}

function BrowseContent({ initial, total, sources }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const query = params.toString();
  const filters = useMemo(() => parseFilters(new URLSearchParams(query)), [query]);

  const catalog = useCatalog();
  // The search text for every video is built once per catalog, not once per keystroke or render.
  const index = useMemo(() => (catalog.videos ? buildSearchIndex(catalog.videos) : null), [catalog.videos]);
  const results = useMemo(() => (index ? filterVideos(index, filters) : null), [index, filters]);
  const hasDurations = useMemo(() => catalog.videos?.some((video) => video.durationSeconds !== null) ?? false, [catalog.videos]);

  // How many results are shown. Tied to the query, so a new filter starts from the first page again.
  const [paging, setPaging] = useState({ query, count: PAGE_SIZE });
  // On a phone the filters fold away so results start on the first screen. From sm up they are always shown.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const visibleCount = paging.query === query ? paging.count : PAGE_SIZE;

  function setFilter<Key extends keyof BrowseFilters>(key: Key, value: BrowseFilters[Key]) {
    const next = filtersToQuery({ ...filters, [key]: value });
    router.replace(next ? `/browse/?${next}` : "/browse/", { scroll: false });
  }

  const active = hasActiveFilters(filters);
  const chips: { label: string; clear: () => void }[] = [];
  if (filters.query) chips.push({ label: `“${filters.query}”`, clear: () => setFilter("query", "") });
  if (filters.section) chips.push({ label: SECTIONS.find((section) => section.id === filters.section)!.title, clear: () => setFilter("section", "") });
  if (filters.type) chips.push({ label: CONTENT_TYPE_LABELS[filters.type], clear: () => setFilter("type", "") });
  if (filters.team) chips.push({ label: teamFullName(TEAMS.find((team) => team.id === filters.team)!), clear: () => setFilter("team", "") });
  if (filters.source) chips.push({ label: sources.find((source) => source.channelId === filters.source)?.name ?? "Source", clear: () => setFilter("source", "") });
  if (filters.duration) chips.push({ label: DURATION_BUCKETS.find((bucket) => bucket.id === filters.duration)!.label, clear: () => setFilter("duration", "") });

  // Before the catalog arrives there is still something true to show when no filter is set.
  const showingInitial = results === null && !active && filters.sort === "newest";
  const videos = results ?? (showingInitial ? initial : null);
  const count = results ? results.length : showingInitial ? total : null;

  const filterCount = chips.length - (filters.query ? 1 : 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setFiltersOpen((open) => !open)}
        aria-expanded={filtersOpen}
        aria-controls="browse-filters"
        className="pill mb-3 sm:hidden"
      >
        <SettingsIcon />
        {filtersOpen ? "Hide filters" : filterCount > 0 ? `Filters (${filterCount})` : "Filters"}
      </button>
      <div id="browse-filters" className={`grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6 ${filtersOpen ? "" : "max-sm:hidden"}`}>
        <FilterSelect label="Section" value={filters.section} onChange={(value) => setFilter("section", value as BrowseFilters["section"])}>
          <option value="">All sections</option>
          {SECTIONS.map((section) => (
            <option key={section.id} value={section.id}>
              {section.title}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Type" value={filters.type} onChange={(value) => setFilter("type", value as BrowseFilters["type"])}>
          <option value="">All types</option>
          {CONTENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {CONTENT_TYPE_LABELS[type]}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Team" value={filters.team} onChange={(value) => setFilter("team", value)}>
          <option value="">All teams</option>
          {TEAMS.map((team) => (
            <option key={team.id} value={team.id}>
              {teamFullName(team)}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Source" value={filters.source} onChange={(value) => setFilter("source", value)}>
          <option value="">All sources</option>
          {sources.map((source) => (
            <option key={source.channelId} value={source.channelId}>
              {source.name}
            </option>
          ))}
        </FilterSelect>
        {/* Durations exist only in catalogs built with the Data API. Offering a filter that always returns nothing would be a dead control. */}
        {(hasDurations || filters.duration) && (
          <FilterSelect label="Length" value={filters.duration} onChange={(value) => setFilter("duration", value as BrowseFilters["duration"])}>
            <option value="">Any length</option>
            {DURATION_BUCKETS.map((bucket) => (
              <option key={bucket.id} value={bucket.id}>
                {bucket.label}
              </option>
            ))}
          </FilterSelect>
        )}
        <FilterSelect label="Order" value={filters.sort} onChange={(value) => setFilter("sort", value as BrowseFilters["sort"])}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </FilterSelect>
      </div>

      <div className="mb-5 mt-4 flex min-h-11 flex-wrap items-center gap-2">
        <p className="mr-2 text-sm text-muted" role="status" aria-live="polite">
          {count === null ? "Loading the catalog…" : pluralize(count, "video")}
        </p>
        {chips.map((chip) => (
          <button key={chip.label} type="button" onClick={chip.clear} aria-label={`Remove filter: ${chip.label}`} className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-full bg-surface-2 pl-3 pr-2 text-sm hover:bg-line">
            {chip.label}
            <CloseIcon className="size-4" />
          </button>
        ))}
        {(active || filters.sort !== NO_FILTERS.sort) && (
          <button type="button" onClick={() => router.replace("/browse/", { scroll: false })} className="h-9 cursor-pointer rounded-full px-3 text-sm text-accent underline underline-offset-2 hover:no-underline">
            Clear filters
          </button>
        )}
      </div>

      {catalog.status === "error" && (
        <div role="alert" className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          The catalog could not be loaded, so search and filters are unavailable.{" "}
          <button type="button" onClick={catalog.retry} className="link cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {videos && videos.length > 0 && <VideoGrid videos={videos.slice(0, visibleCount)} />}

      {results && results.length === 0 && (
        <EmptyState title="No videos match">
          <p>
            {filters.query
              ? "Search looks at titles, channels, teams and content types. Try fewer words or remove a filter."
              : "No video in the catalog fits this combination of filters."}
          </p>
        </EmptyState>
      )}

      {videos && visibleCount < videos.length && (
        <div className="mt-8 flex justify-center">
          <button type="button" className="pill" onClick={() => setPaging({ query, count: visibleCount + PAGE_SIZE })}>
            Show more ({(videos.length - visibleCount).toLocaleString("en-US")} left)
          </button>
        </div>
      )}
    </>
  );
}

/** Search and filters over the whole catalog. The filters live in the URL, so any view can be shared or bookmarked. */
export function BrowseView(props: Props) {
  return (
    // Reading the URL in a statically exported page needs a Suspense boundary.
    // Its fallback is the same grid the page starts with, so nothing jumps.
    <Suspense fallback={<VideoGrid videos={props.initial} />}>
      <BrowseContent {...props} />
    </Suspense>
  );
}
