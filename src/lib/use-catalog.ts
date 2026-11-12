"use client";

import { useEffect, useState } from "react";
import type { Catalog, Video } from "@/catalog/schema";
import { BASE_PATH } from "./site";

// The whole catalog as one static JSON file, fetched at most once per visit
// and shared by every component that needs it.
let request: Promise<Video[]> | null = null;

export function fetchCatalog(): Promise<Video[]> {
  if (!request) {
    request = fetch(`${BASE_PATH}/catalog.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`catalog.json returned HTTP ${response.status}`);
        return response.json() as Promise<Catalog>;
      })
      .then((catalog) => {
        if (!Array.isArray(catalog.videos)) throw new Error("catalog.json has no videos");
        return catalog.videos;
      });
    // A failed request is forgotten so that a retry can start a new one.
    request.catch(() => {
      request = null;
    });
  }
  return request;
}

export type CatalogState =
  | { status: "loading"; videos: null }
  | { status: "ready"; videos: Video[] }
  | { status: "error"; videos: null };

/** Loads the catalog when `enabled`, so pages that may never need it do not download it. */
export function useCatalog(enabled = true): CatalogState & { retry: () => void } {
  const [state, setState] = useState<CatalogState>({ status: "loading", videos: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchCatalog().then(
      (videos) => !cancelled && setState({ status: "ready", videos }),
      () => !cancelled && setState({ status: "error", videos: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, attempt]);

  return {
    ...state,
    retry: () => {
      setState({ status: "loading", videos: null });
      setAttempt((count) => count + 1);
    },
  };
}
