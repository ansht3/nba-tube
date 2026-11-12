import Link from "next/link";
import type { Video } from "@/catalog/schema";
import { formatDuration, formatShortDate } from "@/lib/format";
import { watchPath } from "@/lib/paths";
import { Thumbnail } from "./Thumbnail";
import { VideoLabels } from "./VideoLabels";
import { WatchLaterButton } from "./WatchLaterButton";

export function VideoCard({ video }: { video: Video }) {
  const duration = formatDuration(video.durationSeconds);

  return (
    <article className="group relative min-w-0">
      <Link href={watchPath(video.youtubeId)} className="block rounded-lg">
        <div className="relative aspect-video overflow-hidden rounded-lg bg-surface-2">
          <Thumbnail src={video.thumbnailUrl} />
          {duration && (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/80 px-1.5 py-0.5 text-xs font-medium tabular-nums text-white">
              {duration}
            </span>
          )}
        </div>
        <VideoLabels labels={video.labels} className="mt-2.5" />
        <h3 className="mt-1 line-clamp-2 text-[15px] font-medium leading-snug group-hover:underline">{video.title}</h3>
        <p className="mt-1 text-[13px] text-muted">
          {video.channelTitle}
          <span aria-hidden="true"> · </span>
          <time dateTime={video.publishedAt}>{formatShortDate(video.publishedAt)}</time>
        </p>
      </Link>
      {/* A sibling of the link, not a child: a button may not sit inside an anchor. */}
      <div className="absolute right-1.5 top-1.5">
        <WatchLaterButton video={video} variant="overlay" />
      </div>
    </article>
  );
}

export function VideoGrid({ videos }: { videos: Video[] }) {
  return (
    <div className="video-grid">
      {videos.map((video) => (
        <VideoCard key={video.youtubeId} video={video} />
      ))}
    </div>
  );
}
