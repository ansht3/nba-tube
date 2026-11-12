"use client";

import { useState } from "react";
import type { SectionId } from "@/catalog/content-types";
import type { Video } from "@/catalog/schema";
import { videosForTeam, videosInSection } from "@/catalog/select";
import { LIST_PAGE_SIZE } from "@/lib/site";
import { fetchCatalog } from "@/lib/use-catalog";
import { VideoGrid } from "./VideoCard";

interface Props {
  /** The first page, rendered on the server so the list is there before any script runs. */
  initial: Video[];
  total: number;
  /** Which slice of the catalog this list shows, so later pages can be loaded on demand. */
  scope: { section?: SectionId; teamId?: string };
}

function inScope(videos: Video[], scope: Props["scope"]): Video[] {
  let result = videos;
  if (scope.section) result = videosInSection(result, scope.section);
  if (scope.teamId) result = videosForTeam(result, scope.teamId);
  return result;
}

/**
 * A long list shown one page at a time. Only the first page is in the HTML.
 * The rest come from the catalog file when the viewer asks for more, which
 * keeps section pages small however large the catalog grows.
 */
export function VideoList({ initial, total, scope }: Props) {
  const [videos, setVideos] = useState(initial);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function showMore() {
    setStatus("loading");
    try {
      const all = inScope(await fetchCatalog(), scope);
      setVideos(all.slice(0, videos.length + LIST_PAGE_SIZE));
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  const remaining = total - videos.length;

  return (
    <>
      <VideoGrid videos={videos} />
      {remaining > 0 && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <button type="button" onClick={showMore} disabled={status === "loading"} className="pill disabled:opacity-60">
            {status === "loading" ? "Loading…" : `Show more (${remaining.toLocaleString("en-US")} left)`}
          </button>
          {status === "error" && (
            <p role="alert" className="text-sm text-muted">
              The rest of the list could not be loaded. Check your connection and try again.
            </p>
          )}
        </div>
      )}
    </>
  );
}
