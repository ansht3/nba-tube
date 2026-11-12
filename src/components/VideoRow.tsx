import Link from "next/link";
import type { Video } from "@/catalog/schema";
import { formatDuration, formatShortDate } from "@/lib/format";
import { Thumbnail } from "./Thumbnail";
import { watchPath } from "./VideoCard";
import { VideoLabels } from "./VideoLabels";

/** A compact horizontal card, used for the related list beside the player. */
export function VideoRow({ video }: { video: Video }) {
  const duration = formatDuration(video.durationSeconds);

  return (
    <Link href={watchPath(video.youtubeId)} className="group flex gap-3 rounded-lg">
      <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-md bg-surface-2">
        <Thumbnail src={video.thumbnailUrl} />
        {duration && (
          <span className="absolute bottom-1 right-1 rounded bg-black/80 px-1 text-[11px] font-medium tabular-nums text-white">
            {duration}
          </span>
        )}
      </div>
      <div className="min-w-0">
        <VideoLabels labels={video.labels} />
        <h3 className="mt-0.5 line-clamp-2 text-sm font-medium leading-snug group-hover:underline">{video.title}</h3>
        <p className="mt-0.5 text-xs text-muted">
          {video.channelTitle}
          <span aria-hidden="true"> · </span>
          <time dateTime={video.publishedAt}>{formatShortDate(video.publishedAt)}</time>
        </p>
      </div>
    </Link>
  );
}
