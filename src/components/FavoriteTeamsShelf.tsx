"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Video } from "@/catalog/schema";
import { BASE_PATH } from "@/lib/site";
import { settingsStore } from "@/lib/storage/settings";
import { useStore } from "@/lib/storage/use-store";
import { VideoGrid } from "./VideoCard";

const SHELF_SIZE = 8;

/**
 * The newest videos from the teams picked in Settings. It renders nothing for
 * a viewer who has not picked any, and it only looks at that one setting: this
 * is a filter the viewer chose, not a recommendation.
 */
export function FavoriteTeamsShelf() {
  const { teamIds } = useStore(settingsStore);
  const teams = teamIds.join(",");
  const [shelf, setShelf] = useState<{ teams: string; videos: Video[] } | null>(null);

  useEffect(() => {
    if (!teams) return;
    const controller = new AbortController();
    fetch(`${BASE_PATH}/api/videos?teams=${teams}&limit=${SHELF_SIZE}`, { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<{ videos: Video[] }>) : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((body) => setShelf({ teams, videos: body.videos }))
      .catch(() => {
        // Aborted or offline: the shelf just stays hidden.
      });
    return () => controller.abort();
  }, [teams]);

  const videos = shelf?.teams === teams ? shelf.videos : null;
  if (!teams || !videos || videos.length === 0) return null;

  return (
    <section aria-labelledby="shelf-your-teams" className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="shelf-your-teams" className="text-lg font-bold tracking-tight">
          Your teams
        </h2>
        <Link href="/settings/" className="text-sm text-muted hover:text-text hover:underline">
          Change teams
        </Link>
      </div>
      <VideoGrid videos={videos} />
    </section>
  );
}
