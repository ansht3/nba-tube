import type { Video } from "./schema";

/**
 * When this video's playability was last confirmed, as epoch milliseconds: the later of the last metadata fetch and the
 * last oEmbed recheck. Both prove the video was playable at that moment, so either one lets a recheck wait.
 *
 * This is deliberately separate from `provenance.metadataCheckedAt`. That one is the age of the data YouTube's API
 * terms limit to 30 days, and an oEmbed recheck does not refresh it.
 */
export function lastEmbedCheckMs(video: Pick<Video, "provenance">): number {
  const metadata = Date.parse(video.provenance.metadataCheckedAt);
  const embed = video.provenance.embedCheckedAt === undefined ? Number.NaN : Date.parse(video.provenance.embedCheckedAt);
  // A date that cannot be read never wins: fall back to the other one, and to 0 (always due) if neither parses.
  const valid = [metadata, embed].filter(Number.isFinite);
  return valid.length === 0 ? 0 : Math.max(...valid);
}
