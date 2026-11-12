"use client";

import Link from "next/link";
import { settingsStore } from "@/lib/storage/settings";
import { useStore } from "@/lib/storage/use-store";
import { useCatalog } from "@/lib/use-catalog";
import { VideoGrid } from "./VideoCard";

const SHELF_SIZE = 8;

/**
 * The newest videos from the teams picked in Settings. It renders nothing for
 * a viewer who has not picked any, and it only looks at that one setting: this
 * is a filter the viewer chose, not a recommendation.
 */
export function FavoriteTeamsShelf() {
  const { teamIds } = useStore(settingsStore);
  const catalog = useCatalog(teamIds.length > 0);

  if (teamIds.length === 0 || catalog.status !== "ready") return null;

  const videos = catalog.videos
    .filter((video) => video.labels.teamIds.some((teamId) => teamIds.includes(teamId)))
    .slice(0, SHELF_SIZE);
  if (videos.length === 0) return null;

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
