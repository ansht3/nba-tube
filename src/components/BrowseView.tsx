"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { CONTENT_TYPE_LABELS, SECTIONS } from "@/catalog/content-types";
import type { Video } from "@/catalog/schema";
import { getTeam, teamFullName } from "@/catalog/teams";
import {
  DURATION_BUCKETS,
  NO_FILTERS,
  SORT_OPTIONS,
  UPLOAD_WINDOWS,
  buildSearchIndex,
  filterVideos,
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  type BrowseFilters,
} from "@/lib/browse";
import { pluralize } from "@/lib/format";
import { BEST_FIRST_EXPLANATION } from "@/lib/rank";
import { SITE_NAME } from "@/lib/site";
import { useCatalog } from "@/lib/use-catalog";
import { EmptyState } from "./EmptyState";
import { FilterPanel } from "./FilterPanel";
import { PageHeader } from "./PageHeader";
import { CloseIcon, SettingsIcon } from "./icons";
import { SearchResult } from "./SearchResult";
import { VideoGrid } from "./VideoCard";

const PAGE_SIZE = 48;
const TITLE = "Browse all videos";

function DefaultHeader() {
  return (
    <PageHeader title={TITLE}>
      <p>Every video in the catalog, newest first. Search from the top bar, or open Filters.</p>
    </PageHeader>
  );
}

interface Props {
  /** The newest videos, rendered on the server and shown until the full catalog has loaded. */
  initial: Video[];
  total: number;
  /** Channels that currently have videos, for the source filter. */
  sources: { channelId: string; name: string }[];
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

  // While searching, the heading and the tab title name the search, as on YouTube.
  // Next.js writes the page's own title after a client-side navigation, so the
  // search title is put back whenever the title changes while a search is shown.
  useEffect(() => {
    if (!filters.query) return;
    const title = `${filters.query} · Search · ${SITE_NAME}`;
    const previous = document.title;
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      // Clearing the search stays on this page, which keeps its own title. Leaving it is Next's to title.
      if (window.location.pathname.startsWith("/browse")) document.title = previous;
    };
  }, [filters.query]);

  const [panelOpen, setPanelOpen] = useState(false);
  // How many results are shown. Tied to the query, so a new filter starts from the first page again.
  const [paging, setPaging] = useState({ query, count: PAGE_SIZE });
  const visibleCount = paging.query === query ? paging.count : PAGE_SIZE;

  function navigate(next: BrowseFilters) {
    const search = filtersToQuery(next);
    router.replace(search ? `/browse/?${search}` : "/browse/", { scroll: false });
  }

  function setFilter(key: keyof BrowseFilters, value: string) {
    // Choosing an option closes the panel, as on YouTube, so the results are in view.
    setPanelOpen(false);
    navigate({ ...filters, [key]: key === "sort" && value === "" ? "latest" : value });
  }

  const chips: { label: string; key: keyof BrowseFilters }[] = [];
  if (filters.query) chips.push({ key: "query", label: `“${filters.query}”` });
  if (filters.date) chips.push({ key: "date", label: UPLOAD_WINDOWS.find((window) => window.id === filters.date)!.label });
  if (filters.section) chips.push({ key: "section", label: SECTIONS.find((section) => section.id === filters.section)!.title });
  if (filters.type) chips.push({ key: "type", label: CONTENT_TYPE_LABELS[filters.type] });
  if (filters.team) chips.push({ key: "team", label: teamFullName(getTeam(filters.team)!) });
  if (filters.source) chips.push({ key: "source", label: sources.find((source) => source.channelId === filters.source)?.name ?? "Source" });
  if (filters.duration) chips.push({ key: "duration", label: DURATION_BUCKETS.find((bucket) => bucket.id === filters.duration)!.label });

  const active = hasActiveFilters(filters);
  // Before the catalog arrives there is still something true to show when no filter is set.
  const showingInitial = results === null && !active && filters.sort === "latest";
  const videos = results ?? (showingInitial ? initial : null);
  const count = results ? results.length : showingInitial ? total : null;
  const filterCount = chips.filter((chip) => chip.key !== "query").length + (filters.sort !== "latest" ? 1 : 0);

  return (
    <>
      {filters.query ? <PageHeader title={`Results for “${filters.query}”`} /> : <DefaultHeader />}
      {/* The order, as chips the way a YouTube channel offers Latest, Popular and Oldest. */}
      <div role="group" aria-label="Sort by" className="mb-3 flex gap-3">
        {SORT_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={filters.sort === option.id}
            onClick={() => navigate({ ...filters, sort: option.id })}
            title={option.id === "best" ? BEST_FIRST_EXPLANATION : undefined}
            className="chip"
          >
            {option.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPanelOpen((open) => !open)}
          aria-expanded={panelOpen}
          aria-controls="filter-panel"
          className={`pill ${panelOpen ? "bg-line" : ""}`}
        >
          <SettingsIcon />
          Filters{filterCount > 0 && ` (${filterCount})`}
        </button>
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            onClick={() => navigate({ ...filters, [chip.key]: NO_FILTERS[chip.key] })}
            aria-label={`Remove filter: ${chip.label}`}
            className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-lg bg-text pl-3 pr-2 text-sm font-medium text-bg hover:opacity-85"
          >
            {chip.label}
            <CloseIcon className="size-4" />
          </button>
        ))}
        {(chips.length > 0 || filters.sort !== "latest") && (
          <button type="button" onClick={() => navigate(NO_FILTERS)} className="h-9 cursor-pointer rounded-full px-3 text-sm text-accent underline underline-offset-2 hover:no-underline">
            Clear all
          </button>
        )}
      </div>

      <div id="filter-panel" hidden={!panelOpen}>
        <FilterPanel filters={filters} sources={sources} hasDurations={hasDurations} onChange={setFilter} />
      </div>

      <p className="mb-5 mt-4 text-sm text-muted" role="status" aria-live="polite">
        {count === null ? "Loading the catalog…" : pluralize(count, "video")}
        {filters.sort === "best" && count !== null && <span className="max-sm:block"> · {BEST_FIRST_EXPLANATION}</span>}
      </p>

      {catalog.status === "error" && (
        <div role="alert" className="mb-5 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          The catalog could not be loaded, so search and filters are unavailable.{" "}
          <button type="button" onClick={catalog.retry} className="link cursor-pointer">
            Try again
          </button>
        </div>
      )}

      {videos && videos.length > 0 &&
        (filters.query ? (
          // Search results read like YouTube's: a list with large thumbnails.
          <ul className="flex max-w-5xl flex-col gap-6 sm:gap-4">
            {videos.slice(0, visibleCount).map((video) => (
              <SearchResult key={video.youtubeId} video={video} />
            ))}
          </ul>
        ) : (
          <VideoGrid videos={videos.slice(0, visibleCount)} />
        ))}

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
    <Suspense
      fallback={
        <>
          <DefaultHeader />
          <VideoGrid videos={props.initial} />
        </>
      }
    >
      <BrowseContent {...props} />
    </Suspense>
  );
}
