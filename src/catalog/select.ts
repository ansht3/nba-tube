import { sectionOf, type SectionId } from "./content-types";
import type { Video } from "./schema";

// Selectors over the catalog. The catalog is already sorted newest first, and
// every function here keeps that order unless it says otherwise.

export function videosInSection(videos: Video[], section: SectionId): Video[] {
  return videos.filter((video) => sectionOf(video.labels) === section);
}

export function videosForTeam(videos: Video[], teamId: string): Video[] {
  return videos.filter((video) => video.labels.teamIds.includes(teamId));
}

export function findVideo(videos: Video[], youtubeId: string): Video | undefined {
  return videos.find((video) => video.youtubeId === youtubeId);
}

export function countByTeam(videos: Video[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const video of videos) {
    for (const teamId of video.labels.teamIds) counts.set(teamId, (counts.get(teamId) ?? 0) + 1);
  }
  return counts;
}

function relatedness(video: Video, other: Video): number {
  let score = 0;
  // A shared team is the strongest link: the same game or the same locker room.
  score += 3 * other.labels.teamIds.filter((teamId) => video.labels.teamIds.includes(teamId)).length;
  if (other.labels.contentType === video.labels.contentType) score += 2;
  if (sectionOf(other.labels) === sectionOf(video.labels)) score += 1;
  if (other.channelId === video.channelId) score += 1;
  return score;
}

/**
 * Videos to show beside the one being watched. The order depends only on the
 * catalog: shared team, then same kind of video, then same channel, with newer
 * videos first among equals. Nothing about the viewer goes into it.
 */
export function relatedVideos(video: Video, videos: Video[], limit: number): Video[] {
  return videos
    .filter((other) => other.youtubeId !== video.youtubeId)
    .map((other, index) => ({ other, index, score: relatedness(video, other) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.other);
}
