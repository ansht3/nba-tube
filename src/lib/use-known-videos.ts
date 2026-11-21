"use client";

import { useEffect, useState } from "react";
import { BASE_PATH } from "./site";

/** The API looks up at most this many ids per request. */
export const LOOKUP_CHUNK = 48;
const FRESH_MS = 5 * 60_000;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// What the catalog said about an id, remembered briefly so switching between lists does not ask again.
const answers = new Map<string, { found: boolean; at: number }>();

/**
 * Which of these video ids are still in the catalog. A saved video that left it
 * should link to YouTube instead of a page that no longer exists. Returns null
 * until the answer is known, and stays null if the lookup fails, so a saved
 * video is never hidden or demoted because of a network error.
 */
export function useKnownVideoIds(ids: string[]): Set<string> | null {
  const key = ids.join(",");
  const [result, setResult] = useState<{ key: string; known: Set<string> } | null>(null);

  useEffect(() => {
    if (!key) return;
    const wanted = key.split(",");
    const controller = new AbortController();
    const now = Date.now();
    const missing = wanted.filter((id) => !((answers.get(id)?.at ?? 0) > now - FRESH_MS));

    (async () => {
      for (const group of chunk(missing, LOOKUP_CHUNK)) {
        const response = await fetch(`${BASE_PATH}/api/videos?ids=${group.join(",")}&limit=${LOOKUP_CHUNK}`, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as { videos: { youtubeId: string }[] };
        const found = new Set(body.videos.map((video) => video.youtubeId));
        for (const id of group) answers.set(id, { found: found.has(id), at: Date.now() });
      }
      setResult({ key, known: new Set(wanted.filter((id) => answers.get(id)?.found)) });
    })().catch(() => {
      // Aborted or offline: leave the answer unknown.
    });
    return () => controller.abort();
  }, [key]);

  return result?.key === key ? result.known : null;
}

/** For tests: forget every remembered answer. */
export function clearKnownVideoCache() {
  answers.clear();
}
