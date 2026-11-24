"use client";

import type { RefObject } from "react";
import type { FeedState } from "@/lib/feed";

/** Placeholder cards that hold the space of the page being loaded, so the list does not jump when it arrives. */
function Skeleton({ count }: { count: number }) {
  return (
    <div className="video-grid mt-9" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="aspect-video rounded-xl bg-surface-2" />
          <div className="mt-3 h-3 w-1/3 rounded bg-surface-2" />
          <div className="mt-2 h-4 w-full rounded bg-surface-2" />
          <div className="mt-2 h-3 w-1/2 rounded bg-surface-2" />
        </div>
      ))}
    </div>
  );
}

/**
 * What goes under a list: the element the next page is triggered from, the
 * loading placeholders, and, if a request failed, a message with a retry. A
 * failed list waits here instead of retrying by itself.
 */
export function FeedFooter({ feed, retry, sentinel }: { feed: Pick<FeedState, "status" | "done" | "videos">; retry: () => void; sentinel: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      {feed.status === "loading" && <Skeleton count={6} />}
      {feed.status === "error" && (
        <div role="alert" className="mt-8 flex flex-col items-center gap-3 text-sm">
          <p className="text-muted">More videos could not be loaded. Check your connection and try again.</p>
          <button type="button" onClick={retry} className="pill">
            Try again
          </button>
        </div>
      )}
      {/* Present until the last page has arrived. It is what the browser watches to decide when to load more. */}
      {!feed.done && <div ref={sentinel} aria-hidden="true" className="h-px" data-feed-sentinel />}
      <p className="sr-only" role="status" aria-live="polite">
        {feed.status === "loading" ? "Loading more videos" : feed.done && feed.videos.length > 0 ? "End of the list" : ""}
      </p>
    </>
  );
}
