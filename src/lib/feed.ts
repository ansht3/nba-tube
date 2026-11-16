import type { Video } from "@/catalog/schema";
import type { BrowseFilters } from "./browse";

/** How many videos each request asks for. Small enough to arrive quickly, large enough to stay ahead of a scroll. */
export const FEED_PAGE_SIZE = 24;

/** The API query for a set of browse filters. Defaults are left out, so equal views share one cacheable URL. */
export function feedParams(filters: BrowseFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.query) params.set("q", filters.query);
  if (filters.section) params.set("section", filters.section);
  if (filters.type) params.set("type", filters.type);
  if (filters.team) params.set("team", filters.team);
  if (filters.source) params.set("channel", filters.source);
  if (filters.duration) params.set("duration", filters.duration);
  if (filters.date) params.set("date", filters.date);
  if (filters.sort !== "latest") params.set("sort", filters.sort);
  return params;
}

/** A stable identity for "this list": the same filters give the same key, whatever order the parameters were written in. */
export function feedKey(path: string, params: URLSearchParams): string {
  const sorted = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${path}?${new URLSearchParams(sorted).toString()}`;
}

export interface FeedPage {
  videos: Video[];
  total: number;
  nextCursor: string | null;
}

export interface FeedState {
  key: string;
  videos: Video[];
  /** Matches for the whole list, not just what is loaded. Null until the first page arrives. */
  total: number | null;
  nextCursor: string | null;
  status: "idle" | "loading" | "error";
  /** Every page has been loaded. */
  done: boolean;
}

export type FeedAction =
  | { type: "reset"; key: string; page?: FeedPage }
  | { type: "request" }
  | { type: "loaded"; key: string; page: FeedPage }
  | { type: "failed"; key: string };

export function initialFeed(key: string, page?: FeedPage): FeedState {
  return page
    ? { key, videos: page.videos, total: page.total, nextCursor: page.nextCursor, status: "idle", done: page.nextCursor === null }
    : { key, videos: [], total: null, nextCursor: null, status: "idle", done: false };
}

/**
 * Responses carry the key of the list they were requested for, and a response
 * for any other list is dropped, so a slow answer to an old filter can never
 * land in a new one. Videos are appended without repeats, in arrival order.
 */
export function feedReducer(state: FeedState, action: FeedAction): FeedState {
  switch (action.type) {
    case "reset":
      return initialFeed(action.key, action.page);
    case "request":
      return state.status === "loading" ? state : { ...state, status: "loading" };
    case "loaded": {
      if (action.key !== state.key) return state;
      const seen = new Set(state.videos.map((video) => video.youtubeId));
      const added = action.page.videos.filter((video) => !seen.has(video.youtubeId));
      return {
        ...state,
        videos: [...state.videos, ...added],
        total: action.page.total,
        nextCursor: action.page.nextCursor,
        status: "idle",
        done: action.page.nextCursor === null,
      };
    }
    case "failed":
      return action.key === state.key ? { ...state, status: "error" } : state;
  }
}

/** True when another page should be requested now. A failed list waits for the viewer instead of retrying in a loop. */
export function wantsMore(state: FeedState): boolean {
  return state.status === "idle" && !state.done && state.total !== null;
}

// --- Remembering a list, so going to a video and back returns to the same place ---

export const FEED_CACHE_TTL_MS = 30 * 60_000;
export const FEED_CACHE_MAX_ENTRIES = 12;

export interface SavedFeed {
  videos: Video[];
  total: number;
  nextCursor: string | null;
  scrollY: number;
  savedAt: number;
}

/** A small in-memory map with an age limit and a size limit. It lives as long as the page does, which covers back and forward navigation. */
export class FeedCache {
  private entries = new Map<string, SavedFeed>();

  save(key: string, feed: Omit<SavedFeed, "savedAt">, now: number): void {
    this.entries.delete(key);
    this.entries.set(key, { ...feed, savedAt: now });
    // Least recently saved goes first (a Map iterates in insertion order).
    while (this.entries.size > FEED_CACHE_MAX_ENTRIES) this.entries.delete(this.entries.keys().next().value!);
  }

  restore(key: string, now: number): SavedFeed | null {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (now - entry.savedAt > FEED_CACHE_TTL_MS) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  clear(): void {
    this.entries.clear();
  }
}
