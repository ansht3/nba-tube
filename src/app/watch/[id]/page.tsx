import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCatalog } from "@/catalog/load";
import { findVideo, relatedVideos } from "@/catalog/select";
import { getTeam, teamFullName } from "@/catalog/teams";
import { AddToPlaylist } from "@/components/AddToPlaylist";
import { HistoryRecorder } from "@/components/HistoryRecorder";
import { ExternalIcon } from "@/components/icons";
import { LikeButton } from "@/components/LikeButton";
import { Player } from "@/components/Player";
import { contentLabel } from "@/components/VideoLabels";
import { VideoRow } from "@/components/VideoRow";
import { WatchLaterButton } from "@/components/WatchLaterButton";
import { formatDuration, formatLongDate } from "@/lib/format";
import { teamPath } from "@/lib/paths";
import { SITE_NAME } from "@/lib/site";
import { channelUrl, watchUrl } from "@/lib/youtube";

const RELATED_COUNT = 20;

// Only videos in the catalog have a page. Any other id is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return loadCatalog().videos.map((video) => ({ id: video.youtubeId }));
}

export async function generateMetadata({ params }: PageProps<"/watch/[id]">): Promise<Metadata> {
  const { id } = await params;
  const video = findVideo(loadCatalog().videos, id);
  if (!video) return { title: "Video not found" };
  return { title: video.title, description: `${contentLabel(video.labels)} from ${video.channelTitle}.` };
}

const PUBLISHER_DESCRIPTIONS = {
  league: "the league's official channel",
  team: "an official team channel",
} as const;

export default async function WatchPage({ params }: PageProps<"/watch/[id]">) {
  const { id } = await params;
  const { videos } = loadCatalog();
  const video = findVideo(videos, id);
  if (!video) notFound();

  const related = relatedVideos(video, videos, RELATED_COUNT);
  const teams = video.labels.teamIds.map(getTeam).filter((team) => team !== undefined);
  const duration = formatDuration(video.durationSeconds);
  const manual = video.provenance.verificationStatus === "manual-review";

  return (
    // Player and details on the left, related videos down the right, as on YouTube.
    <div className="grid gap-x-6 gap-y-10 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)]">
      <article className="min-w-0">
        <HistoryRecorder youtubeId={video.youtubeId} title={video.title} channelTitle={video.channelTitle} />
        {/* Full-bleed on phones, where every pixel of width matters for video. */}
        <div className="max-sm:-mx-4 max-sm:[&>div]:rounded-none">
          <Player key={video.youtubeId} youtubeId={video.youtubeId} title={video.title} />
        </div>

        <h1 className="mt-3 text-xl font-bold leading-snug tracking-tight">{video.title}</h1>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <a href={channelUrl(video.channelId)} target="_blank" rel="noopener noreferrer" className="rounded-md font-semibold hover:underline">
            {video.channelTitle}
          </a>
          <div className="flex flex-wrap gap-2">
          <LikeButton video={video} />
          <WatchLaterButton video={video} variant="pill" />
          <AddToPlaylist video={video} />
            <a href={watchUrl(video.youtubeId)} target="_blank" rel="noopener noreferrer" aria-label="Open on YouTube" className="pill">
              <ExternalIcon />
              YouTube
            </a>
          </div>
        </div>

        {/* The description box: what kind of video this is, when, which teams, and why it is here. */}
        <section aria-label="About this video" className="mt-4 rounded-xl bg-surface-2 p-4 text-sm">
          <p className="font-semibold">
            <time dateTime={video.publishedAt}>{formatLongDate(video.publishedAt)}</time>
            {duration && <> · {duration}</>}
            <span className="text-accent"> · {contentLabel(video.labels)}</span>
          </p>
          {teams.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Teams">
              {teams.map((team) => (
                <li key={team.id}>
                  <Link href={teamPath(team.id)} className="inline-flex h-8 items-center rounded-md bg-bg px-3 text-[13px] font-medium hover:bg-line">
                    {teamFullName(team)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 space-y-2 text-muted">
            <p>
              It was published by {video.channelTitle}, {PUBLISHER_DESCRIPTIONS[video.provenance.publisherType]}, which
              is on the{" "}
              <Link href="/about/#sources" className="link">
                list of verified sources
              </Link>
              .
            </p>
            <p>
              {manual
                ? "A person reviewed it and added it to the catalog by hand."
                : `Its title matched the “${video.labels.reason}” rule, which labels it as ${contentLabel(video.labels).toLowerCase()}.`}{" "}
              The label and team tags are {SITE_NAME}&apos;s own. The title, thumbnail and video come from YouTube
              unchanged.
            </p>
          </div>
        </section>
      </article>

      <aside aria-labelledby="related-heading" className="min-w-0">
        <h2 id="related-heading" className="text-base font-bold tracking-tight">
          Related
        </h2>
        <p className="mt-0.5 text-xs text-muted">Same team, same kind of video or same channel. No personalisation.</p>
        {related.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing related in the catalog right now.</p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {related.map((other) => (
              <li key={other.youtubeId}>
                <VideoRow video={other} />
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
