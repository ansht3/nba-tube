import type { ContentType } from "@/catalog/content-types";
import type { Video } from "@/catalog/schema";

/**
 * "Best first" is a published formula, not a recommendation model. Each kind
 * of video has a fixed weight, and every day since upload costs one point. So
 * a game recap stays ahead of a practice availability posted up to three days
 * later, but last week's recap does not outrank last night's. Nothing about
 * the viewer, and no view or like counts, go into it.
 */
export const KIND_WEIGHTS: Record<ContentType, number> = {
  GAME_HIGHLIGHTS: 3,
  POSTGAME_INTERVIEW: 2,
  COACH_PRESS_CONFERENCE: 2,
  PLAYER_HIGHLIGHTS: 2,
  TOP_PLAYS: 1.5,
  PREGAME_INTERVIEW: 1,
  OFFICIAL_BASKETBALL_INTERVIEW: 1,
  MEDIA_AVAILABILITY: 0.5,
};

/** The league channel's recaps cover both teams of a game, so they get a small extra weight. */
export const LEAGUE_RECAP_BONUS = 0.5;

const DAY_MS = 86_400_000;

export const BEST_FIRST_EXPLANATION =
  "Game recaps first, then postgame sessions and player highlights, then the rest. Each day since upload counts against a video.";

export function bestFirstScore(video: Video, now: number): number {
  const ageDays = Math.max(0, now - Date.parse(video.publishedAt)) / DAY_MS;
  const leagueRecap = video.provenance.publisherType === "league" && video.labels.contentType === "GAME_HIGHLIGHTS";
  return KIND_WEIGHTS[video.labels.contentType] + (leagueRecap ? LEAGUE_RECAP_BONUS : 0) - ageDays;
}

/** Highest score first. Ties go to the newer video, then the id, so the order never depends on input order. */
export function sortBestFirst(videos: Video[], now: number): Video[] {
  return videos
    .map((video) => ({ video, score: bestFirstScore(video, now) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        Date.parse(b.video.publishedAt) - Date.parse(a.video.publishedAt) ||
        a.video.youtubeId.localeCompare(b.video.youtubeId),
    )
    .map((entry) => entry.video);
}
