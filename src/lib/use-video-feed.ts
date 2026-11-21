"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { FEED_PAGE_SIZE, FeedCache, feedKey, feedReducer, initialFeed, parseFeedPage, wantsMore, type FeedPage, type SavedFeed } from "./feed";
import { BASE_PATH } from "./site";

/** Lists the viewer has scrolled, kept for as long as the page is open so back and forward return to the same place. */
const cache = new FeedCache();

/** How far below the viewport the next page is requested, so it has arrived before the viewer gets there. */
const PREFETCH_MARGIN = "1200px 0px";

export interface UseVideoFeedOptions {
  /** Which page this list belongs to, so lists on different pages never share a saved state. */
  path: string;
  /** The API filters. Everything that changes the list must be in here. */
  params: URLSearchParams;
  /** The first page rendered on the server, valid only for the default filters of `path`. */
  initial?: { key: string; page: FeedPage };
}

/**
 * Loads a list from /api/videos a page at a time as the viewer scrolls. Mount
 * it under `key={feedKey}` so a change of filters starts a fresh list: the
 * hook assumes its key never changes. It requests one page at a time, ignores
 * answers for lists the viewer left, stops on a failure until asked to retry,
 * and remembers the list and scroll position for a return visit.
 */
export function useVideoFeed({ path, params, initial }: UseVideoFeedOptions) {
  const key = feedKey(path, params);
  // Worked out once, when the list first appears: a remembered list from an earlier visit, else the server's first page.
  const [seed] = useState<SavedFeed | null>(() => {
    const restored = cache.restore(key, Date.now());
    return restored ?? (initial?.key === key ? { ...initial.page, scrollY: 0, savedAt: 0 } : null);
  });

  const [state, dispatch] = useReducer(feedReducer, seed, (start) => initialFeed(key, start ?? undefined));
  const latest = useRef(state);
  const inFlight = useRef(false);
  const lastScrollY = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    latest.current = state;
  });

  const load = useCallback(async () => {
    const current = latest.current;
    if (inFlight.current || current.done) return;
    inFlight.current = true;
    dispatch({ type: "request" });
    const query = new URLSearchParams(params);
    query.set("limit", String(FEED_PAGE_SIZE));
    if (current.nextCursor) query.set("cursor", current.nextCursor);
    try {
      const response = await fetch(`${BASE_PATH}/api/videos?${query}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const page = parseFeedPage(await response.json());
      if (!page) throw new Error("The response was not a page of videos.");
      dispatch({ type: "loaded", key, page });
    } catch {
      dispatch({ type: "failed", key });
    } finally {
      inFlight.current = false;
    }
  }, [key, params]);

  // A list that was not seeded has no first page yet.
  useEffect(() => {
    if (latest.current.total === null) void load();
  }, [load]);

  // Ask for the next page when the end of the list comes within reach. The observer is made again after each
  // page, because it reports only changes, and the end may still be in reach after the page arrives.
  const loaded = state.videos.length;
  useEffect(() => {
    const element = sentinel.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && wantsMore(latest.current)) void load();
      },
      { rootMargin: PREFETCH_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [load, loaded, state.status]);

  // Return to where the viewer was in a restored list.
  useLayoutEffect(() => {
    const target = seed?.scrollY;
    if (!target) return;
    lastScrollY.current = target;
    window.scrollTo(0, target);
    const frame = requestAnimationFrame(() => window.scrollTo(0, target));
    return () => cancelAnimationFrame(frame);
  }, [seed]);

  // Remember the list and the scroll position. The position is read on every scroll, not when leaving, because
  // by the time this component unmounts a navigation may already have moved the page.
  useEffect(() => {
    const save = () => {
      const s = latest.current;
      if (s.total !== null) cache.save(key, { videos: s.videos, total: s.total, nextCursor: s.nextCursor, scrollY: lastScrollY.current }, Date.now());
    };
    const onScroll = () => {
      lastScrollY.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      save();
    };
  }, [key]);

  const retry = useCallback(() => {
    dispatch({ type: "reset", key, page: latest.current.total === null ? undefined : { videos: latest.current.videos, total: latest.current.total, nextCursor: latest.current.nextCursor } });
    void load();
  }, [key, load]);

  return { ...state, sentinel, retry };
}

/** For tests: forget every remembered list. */
export function clearFeedCache() {
  cache.clear();
}
