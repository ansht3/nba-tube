import Link from "next/link";
import type { Video } from "@/catalog/schema";
import { formatDuration, formatShortDate } from "@/lib/format";
import { watchPath } from "@/lib/paths";
import { Thumbnail } from "./Thumbnail";
import { VideoLabels } from "./VideoLabels";

/** A search result row: large thumbnail on the left, details on the right. Stacks on phones. */
export function SearchResult({ video }: { video: Video }) {
  const duration = formatDuration(video.durationSeconds);

  return (
    <li>
      <Link href={watchPath(video.youtubeId)} className="group flex flex-col gap-3 rounded-xl sm:flex-row sm:gap-4">
        <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:w-[min(360px,45%)]">
          <Thumbnail src={video.thumbnailUrl} />
          {duration && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
              {duration}
            </span>
          )}
        </div>
        <div className="min-w-0 sm:py-1">
          <h3 className="line-clamp-2 text-lg font-medium leading-snug group-hover:underline">{video.title}</h3>
          <p className="mt-1 text-[13px] text-muted">
            <time dateTime={video.publishedAt}>{formatShortDate(video.publishedAt)}</time>
          </p>
          <p className="mt-3 text-sm text-muted">{video.channelTitle}</p>
          <VideoLabels labels={video.labels} className="mt-2" />
        </div>
      </Link>
    </li>
  );
}
