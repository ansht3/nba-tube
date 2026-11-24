"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { watchHref, type QueueEntry } from "@/lib/queue";
import { useWatchQueue } from "@/lib/use-watch-queue";
import { SkipNextIcon, SkipPreviousIcon } from "./icons";
import { VIDEO_ENDED_EVENT } from "./Player";

interface Props {
  currentId: string;
  /** The suggestions beside the video, in order. */
  related: QueueEntry[];
}

function Controls({ currentId, related }: Props) {
  const queue = useWatchQueue(currentId, related);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const onEnded = (event: Event) => {
      if ((event as CustomEvent<{ youtubeId: string }>).detail?.youtubeId === currentId) setEnded(true);
    };
    window.addEventListener(VIDEO_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(VIDEO_ENDED_EVENT, onEnded);
  }, [currentId]);

  const { previous, next, listId } = queue;
  return (
    <>
      <nav aria-label="Previous and next video" className="mt-3 flex flex-wrap items-center gap-2">
        {previous ? (
          <Link href={watchHref(previous.id, listId)} data-shortcut="previous" title={previous.title} className="pill">
            <SkipPreviousIcon />
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className="pill pointer-events-none opacity-50">
            <SkipPreviousIcon />
            Previous
          </span>
        )}
        {next ? (
          <Link href={watchHref(next.id, listId)} data-shortcut="next" title={next.title} className="pill">
            Next
            <SkipNextIcon />
          </Link>
        ) : (
          <span aria-disabled="true" className="pill pointer-events-none opacity-50">
            {listId ? "End of playlist" : "Next"}
            {!listId && <SkipNextIcon />}
          </span>
        )}
      </nav>
      {/* Shown below the player, never over it. It offers the next video; the viewer decides to open it. */}
      {ended && next && (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-surface px-4 py-3 text-sm">
          <span className="min-w-0">
            Video ended. Up next: <strong className="font-semibold">{next.title}</strong>
          </span>
          <Link href={watchHref(next.id, listId)} className="pill">
            Play next
          </Link>
        </p>
      )}
    </>
  );
}

/** Previous and Next under the player, and an offer of the next video when this one ends. Nothing here plays by itself. */
export function WatchControls(props: Props) {
  return (
    <Suspense fallback={null}>
      <Controls {...props} />
    </Suspense>
  );
}
