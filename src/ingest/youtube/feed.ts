import type { Source } from "@/catalog/sources";
import { YOUTUBE_ID_PATTERN } from "@/catalog/schema";
import { defaultThumbnailUrl, type CandidateVideo } from "../candidate";
import { fetchWithRetry, type FetchLike, type RetryOptions } from "../http";

const FEED_URL = "https://www.youtube.com/feeds/videos.xml";

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
    if (entity.startsWith("#x") || entity.startsWith("#X")) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith("#")) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return XML_ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

function tagText(xml: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<]*)</${tag}>`).exec(xml);
  return match ? decodeXml(match[1]).trim() : null;
}

/**
 * Reads the entries of a YouTube Atom feed. The format is small and stable, so
 * a few targeted patterns are enough and an XML parser is not worth a
 * dependency. Entries missing an id, title or date are skipped.
 */
export function parseFeed(xml: string): CandidateVideo[] {
  const videos: CandidateVideo[] = [];

  for (const entry of xml.split("<entry>").slice(1)) {
    const youtubeId = tagText(entry, "yt:videoId");
    const channelId = tagText(entry, "yt:channelId");
    const title = tagText(entry, "title");
    const publishedAt = tagText(entry, "published");
    const channelTitle = tagText(entry, "name");

    if (!youtubeId || !YOUTUBE_ID_PATTERN.test(youtubeId)) continue;
    if (!channelId || !title || !channelTitle) continue;
    if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) continue;

    videos.push({
      youtubeId,
      title,
      channelId,
      channelTitle,
      // The feed's own thumbnail host varies (i1 to i4). The canonical host serves the same image.
      thumbnailUrl: defaultThumbnailUrl(youtubeId),
      publishedAt,
      durationSeconds: null,
      embeddable: null,
      privacyStatus: null,
      liveBroadcast: null,
      isVertical: null,
      discoveryMethod: "channel-feed",
    });
  }

  return videos;
}

/** Thrown when a channel's feed could not be read, so the sync can skip that channel and carry on. */
export class FeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedError";
  }
}

async function fetchFeed(url: string, fetchImpl: FetchLike, retry?: RetryOptions): Promise<CandidateVideo[] | null> {
  const response = await fetchWithRetry(fetchImpl, url, retry);
  if (response.status === 404) return null;
  if (!response.ok) throw new FeedError(`Feed request failed with HTTP ${response.status}`);
  return parseFeed(await response.text());
}

/**
 * The newest uploads of one channel, without an API key.
 *
 * The long-form playlist (the channel id with "UULF" in place of "UC") leaves
 * out Shorts. It is not an officially documented id, so when it is missing or
 * empty this falls back to the plain channel feed.
 */
export async function fetchChannelFeed(
  source: Source,
  fetchImpl: FetchLike,
  retry?: RetryOptions,
): Promise<CandidateVideo[]> {
  const longFormPlaylist = `UULF${source.channelId.slice(2)}`;
  let videos = await fetchFeed(`${FEED_URL}?playlist_id=${longFormPlaylist}`, fetchImpl, retry);

  if (!videos || videos.length === 0) {
    videos = await fetchFeed(`${FEED_URL}?channel_id=${source.channelId}`, fetchImpl, retry);
  }
  if (!videos) throw new FeedError(`No feed found for channel ${source.channelId}`);

  // A playlist feed could in principle contain another channel's video. Only
  // uploads by the verified channel itself are candidates.
  return videos.filter((video) => video.channelId === source.channelId);
}
