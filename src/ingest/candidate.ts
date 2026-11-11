import type { DiscoveryMethod } from "@/catalog/schema";

/**
 * A video as discovery found it, before any decision about whether it belongs
 * in the catalog. Fields a discovery method cannot know are null: the Atom
 * feeds, for example, carry no duration.
 */
export interface CandidateVideo {
  youtubeId: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string;
  publishedAt: string;
  durationSeconds: number | null;
  embeddable: boolean | null;
  privacyStatus: "public" | "unlisted" | "private" | null;
  liveBroadcast: "none" | "live" | "upcoming" | null;
  /** True when the player is taller than it is wide, which is how Shorts are shaped. */
  isVertical: boolean | null;
  discoveryMethod: DiscoveryMethod;
}

/** YouTube serves this size for every video, so it is a safe default when none was provided. */
export function defaultThumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}
