"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef } from "react";
import { pluralize } from "@/lib/format";
import { watchHref, type QueueEntry } from "@/lib/queue";
import { useWatchQueue } from "@/lib/use-watch-queue";

interface Props {
  currentId: string;
  related: QueueEntry[];
}

function Panel({ currentId, related }: Props) {
  const queue = useWatchQueue(currentId, related);
  const list = useRef<HTMLOListElement>(null);

  // Show the current video inside the panel without moving the page.
  useEffect(() => {
    const container = list.current;
    const current = container?.querySelector<HTMLElement>('[aria-current="true"]');
    if (container && current) container.scrollTop = Math.max(0, current.offsetTop - container.offsetTop - 48);
  }, [currentId, queue.source]);

  if (queue.source !== "playlist") return null;
  return (
    <section aria-labelledby="playlist-queue-title" className="mb-6 overflow-hidden rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <h2 id="playlist-queue-title" className="font-semibold">
          {queue.listName}
        </h2>
        <p className="text-sm text-muted">
          {queue.index + 1} of {pluralize(queue.entries.length, "video")}
        </p>
      </div>
      <ol ref={list} className="max-h-96 overflow-y-auto">
        {queue.entries.map((entry, index) => (
          <li key={entry.id}>
            <Link
              href={watchHref(entry.id, queue.listId)}
              aria-current={index === queue.index ? "true" : undefined}
              className="grid grid-cols-[1.5rem_1fr] gap-2 px-4 py-2.5 text-sm hover:bg-surface-2 aria-[current=true]:bg-surface-2 aria-[current=true]:font-semibold"
            >
              <span className="text-right tabular-nums text-muted">{index + 1}</span>
              <span className="min-w-0">
                <span className="line-clamp-2">{entry.title}</span>
                <span className="block text-xs font-normal text-muted">{entry.channelTitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The playlist being played, with the current video marked. Renders nothing when the video is not played from a playlist. */
export function PlaylistPanel(props: Props) {
  return (
    <Suspense fallback={null}>
      <Panel {...props} />
    </Suspense>
  );
}
