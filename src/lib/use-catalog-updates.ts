"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UpdatesBody } from "@/lib/api/catalog";
import { nextDelay, shouldCheckOnFocus } from "./update-schedule";
import { BASE_PATH } from "./site";

export interface CatalogMarker {
  version: string;
  newestId: string;
}

export interface CatalogUpdates {
  /** New videos since the page was built or last acknowledged. With hasMore, at least this many. */
  count: number;
  hasMore: boolean;
  /** The video the page was built around is gone, so "new" cannot be computed; the page should reload. */
  reset: boolean;
  /** Mark everything seen so far as read, so the notice stops mentioning it. */
  acknowledge: () => void;
}

async function getJson<T>(path: string): Promise<T> {
  // The server answers a repeat with 304, so asking is cheap; no-store is not needed.
  const response = await fetch(`${BASE_PATH}${path}`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Tells a page when videos were published after it was built, without
 * redeploying and without downloading the catalog. It polls /api/version,
 * about 100 bytes, only while the tab is visible and on a jittered timer, and
 * asks /api/updates for details only when the version changed. It never
 * reloads anything by itself.
 */
export function useCatalogUpdates(initial: CatalogMarker | null): CatalogUpdates {
  const [state, setState] = useState({ count: 0, hasMore: false, reset: false });
  // What the page knows: moves forward when the user acknowledges new videos.
  const known = useRef<CatalogMarker | null>(initial);
  // What the server last told us, ready to become `known` on acknowledge.
  const latest = useRef<CatalogMarker | null>(initial);

  useEffect(() => {
    if (!initial) return;
    known.current = initial;
    latest.current = initial;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let lastCheck = Date.now();
    let stopped = false;

    const schedule = () => {
      if (!stopped) timer = setTimeout(check, nextDelay(failures));
    };

    async function check() {
      // A hidden tab does no work. The next visible moment checks instead.
      if (document.hidden) return schedule();
      lastCheck = Date.now();
      try {
        const version = await getJson<{ version: string }>("/api/version");
        failures = 0;
        if (version.version !== latest.current!.version) {
          const updates = await getJson<UpdatesBody>(`/api/updates?since=${known.current!.newestId}&limit=24`);
          if (stopped) return;
          latest.current = { version: updates.version, newestId: updates.videos[0]?.youtubeId ?? known.current!.newestId };
          setState({ count: updates.count, hasMore: updates.hasMore, reset: updates.reset });
        }
      } catch {
        // Offline, or the server is busy: wait longer each time rather than hammering it.
        failures += 1;
      }
      schedule();
    }

    const onVisibilityChange = () => {
      if (document.hidden || !shouldCheckOnFocus(lastCheck, Date.now())) return;
      clearTimeout(timer);
      void check();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [initial]);

  const acknowledge = useCallback(() => {
    known.current = latest.current;
    setState({ count: 0, hasMore: false, reset: false });
  }, []);

  return { ...state, acknowledge };
}
