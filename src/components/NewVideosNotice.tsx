"use client";

import { useEffect, useState } from "react";
import type { Catalog } from "@/catalog/schema";
import { pluralize } from "@/lib/format";
import { BASE_PATH } from "@/lib/site";

const CHECK_EVERY = 5 * 60_000;

/**
 * Pages are prebuilt, so a deploy with new videos only shows after a reload.
 * This checks the live catalog every few minutes and when the tab comes back
 * into view, and offers the reload. It never reloads on its own, so a video
 * that is playing is never interrupted.
 */
export function NewVideosNotice({ newestAt }: { newestAt: string | null }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!newestAt) return;
    const since = Date.parse(newestAt);

    async function check() {
      if (document.hidden) return;
      try {
        // "no-cache" revalidates with the server, so an unchanged catalog costs a 304.
        const response = await fetch(`${BASE_PATH}/catalog.json`, { cache: "no-cache" });
        if (!response.ok) return;
        const catalog = (await response.json()) as Catalog;
        setCount(catalog.videos.filter((video) => Date.parse(video.publishedAt) > since).length);
      } catch {
        // Offline or a deploy in progress: try again at the next check.
      }
    }

    const timer = setInterval(check, CHECK_EVERY);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [newestAt]);

  if (count === 0) return null;
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-text py-2 pl-5 pr-2 text-sm text-bg shadow-lg">
      {pluralize(count, "new video")}
      <button type="button" onClick={() => window.location.reload()} className="h-9 cursor-pointer rounded-full bg-accent px-4 font-medium text-accent-text hover:opacity-90">
        Show
      </button>
      <button type="button" onClick={() => setCount(0)} aria-label="Dismiss" className="grid size-9 cursor-pointer place-items-center rounded-full hover:bg-white/15">
        ×
      </button>
    </div>
  );
}
