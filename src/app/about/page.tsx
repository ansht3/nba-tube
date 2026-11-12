import type { Metadata } from "next";
import Link from "next/link";
import { CONTENT_TYPES, CONTENT_TYPE_LABELS } from "@/catalog/content-types";
import { loadCatalog, loadSources } from "@/catalog/load";
import { approvedSources } from "@/catalog/sources";
import { formatLongDate, pluralize } from "@/lib/format";
import { REPOSITORY_URL, SITE_NAME } from "@/lib/site";
import { channelUrl } from "@/lib/youtube";

export const metadata: Metadata = { title: "About", description: `How ${SITE_NAME} chooses its videos.` };

const MODE_DESCRIPTIONS = {
  api: "built with the YouTube Data API",
  feed: "built from the channels' public upload feeds, without an API key",
  seed: "the small sample snapshot that ships with the code, not a live sync",
} as const;

export default function AboutPage() {
  const catalog = loadCatalog();
  const sources = approvedSources(loadSources());

  return (
    <article className="max-w-2xl text-[15px] leading-relaxed [&_h2]:mt-10 [&_h2]:text-lg [&_h2]:font-bold [&_p]:mt-3">
      <h1 className="text-2xl font-bold tracking-tight">About {SITE_NAME}</h1>
      <p className="text-muted">
        A quiet way to watch official NBA video. Game highlights, player highlights and the media sessions before and
        after games, from the league and the teams themselves.
      </p>

      <h2>Why it exists</h2>
      <p>
        Looking for last night&apos;s press conference on YouTube means wading through reaction channels, fan edits,
        AI-voiced clips and betting picks. {SITE_NAME} lists only what the league and the teams publish, newest first,
        with nothing chosen for you by an algorithm and no comments.
      </p>

      <h2>How videos are chosen</h2>
      <p>
        Videos come only from {pluralize(sources.length, "verified channel")}: the NBA&apos;s own channel and the
        official channel of each team. Every channel was confirmed through a link on the team&apos;s official website or,
        where that was not available, through YouTube&apos;s verification badge together with its audience and current
        uploads. A display name alone is never trusted.
      </p>
      <p>
        Official channels also post podcasts, documentaries, hype videos and Shorts. A fixed set of rules reads each
        title and keeps only these kinds of video:
      </p>
      <ul className="mt-3 list-disc pl-6">
        {CONTENT_TYPES.map((type) => (
          <li key={type}>{CONTENT_TYPE_LABELS[type]}</li>
        ))}
      </ul>
      <p>
        When a title does not make the kind of video clear, it is left out. No AI model decides what appears here. Each
        video page has a “Why this video is on {SITE_NAME}” note naming the rule that let it in.
      </p>
      <p>
        The labels and team tags are {SITE_NAME}&apos;s own. Titles, thumbnails and the videos themselves come from
        YouTube unchanged, and every video plays in YouTube&apos;s official player.
      </p>

      <h2>This catalog</h2>
      <p>
        {pluralize(catalog.videos.length, "video")}, generated on {formatLongDate(catalog.generatedAt)}. It is{" "}
        {MODE_DESCRIPTIONS[catalog.mode]}.
      </p>

      <h2 id="sources">Sources</h2>
      <ul className="mt-3 columns-1 gap-6 text-sm sm:columns-2">
        {sources.map((source) => (
          <li key={source.channelId} className="break-inside-avoid py-0.5">
            <a href={channelUrl(source.channelId)} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {source.name}
            </a>
          </li>
        ))}
      </ul>

      <h2>Privacy</h2>
      <p>
        There are no accounts and no analytics. Likes, playlists, history and settings stay in your browser. Playing a
        video loads YouTube&apos;s player, which is covered by Google&apos;s policies.{" "}
        <Link href="/privacy/" className="link">
          Read the privacy notice
        </Link>
        .
      </p>

      <h2>Open source</h2>
      <p>
        The code is MIT licensed and{" "}
        <a href={REPOSITORY_URL} className="link" target="_blank" rel="noopener noreferrer">
          available on GitHub
        </a>
        . The license covers the code only. Videos, thumbnails, titles and team names belong to their owners.
      </p>

      <h2>Not affiliated</h2>
      <p>
        {SITE_NAME} is an independent project. It is not affiliated with, endorsed by or sponsored by the NBA, its teams,
        any broadcaster, YouTube or Google.
      </p>
    </article>
  );
}
