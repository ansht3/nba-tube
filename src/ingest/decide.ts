import type { Video } from "@/catalog/schema";
import type { Source } from "@/catalog/sources";
import { findTeamByMatchupName } from "@/catalog/teams";
import type { CandidateVideo } from "./candidate";
import { classify, type Classification, type RejectionReason } from "./classify";
import type { Overrides } from "./overrides";

export type Decision =
  | { accepted: true; video: Video }
  | { accepted: false; rejection: RejectionReason; ruleId: string };

// The league channel titles every full-game recap the same way:
// "THUNDER at TRAIL BLAZERS | FULL GAME HIGHLIGHTS | November 10, 2026".
const LEAGUE_MATCHUP = /^(?:EXTENDED:\s*)?(.+?)\s+(?:at|vs\.?)\s+(.+?)\s*\|\s*FULL GAME HIGHLIGHTS\b/i;

/**
 * Which teams a video is about. A team channel's videos belong to that team.
 * For the league channel, both teams are read from the matchup title, and only
 * when both names match the team table exactly. Anything else gets no team
 * rather than a guess.
 */
export function teamIdsFor(video: CandidateVideo, source: Source): string[] {
  if (source.teamId) return [source.teamId];

  const match = LEAGUE_MATCHUP.exec(video.title);
  if (!match) return [];
  const away = findTeamByMatchupName(match[1]);
  const home = findTeamByMatchupName(match[2]);
  if (!away || !home || away.id === home.id) return [];
  return [away.id, home.id];
}

function buildVideo(
  candidate: CandidateVideo,
  source: Source,
  labels: Pick<Video["labels"], "contentType" | "gamePhase" | "reason"> & { teamIds?: string[] },
  verificationStatus: Video["provenance"]["verificationStatus"],
  checkedAt: Date,
): Video {
  return {
    youtubeId: candidate.youtubeId,
    title: candidate.title,
    channelId: candidate.channelId,
    channelTitle: candidate.channelTitle,
    thumbnailUrl: candidate.thumbnailUrl,
    publishedAt: new Date(candidate.publishedAt).toISOString(),
    durationSeconds: candidate.durationSeconds,
    embeddable: candidate.embeddable,
    labels: {
      contentType: labels.contentType,
      gamePhase: labels.gamePhase,
      teamIds: labels.teamIds ?? teamIdsFor(candidate, source),
      // Left empty until there is a verified roster to check names against.
      playerNames: [],
      reason: labels.reason,
    },
    provenance: {
      publisherType: source.publisherType,
      discoveryMethod: candidate.discoveryMethod,
      verificationStatus,
      metadataCheckedAt: checkedAt.toISOString(),
    },
  };
}

function reject(result: Extract<Classification, { accepted: false }>): Decision {
  return { accepted: false, rejection: result.rejection, ruleId: result.ruleId };
}

/**
 * The single place where a discovered video becomes a catalog record or a
 * rejection. Manual overrides are applied first, then the classifier.
 */
export function decide(
  candidate: CandidateVideo,
  source: Source | undefined,
  overrides: Overrides,
  checkedAt: Date,
): Decision {
  if (overrides.exclude.some((entry) => entry.youtubeId === candidate.youtubeId)) {
    return { accepted: false, rejection: "MANUAL_EXCLUSION", ruleId: "manual-exclusion" };
  }

  const result = classify(candidate, source);
  const inclusion = overrides.include.find((entry) => entry.youtubeId === candidate.youtubeId);

  if (inclusion && source) {
    // A person can overrule the title rules, but not the publisher check or
    // the fact that a video cannot be played.
    const blocked = !result.accepted && ["UNVERIFIED_PUBLISHER", "UNAVAILABLE_VIDEO"].includes(result.rejection);
    if (!blocked) {
      const labels = {
        contentType: inclusion.contentType,
        gamePhase: inclusion.gamePhase,
        teamIds: inclusion.teamIds,
        reason: "manual-inclusion",
      };
      return { accepted: true, video: buildVideo(candidate, source, labels, "manual-review", checkedAt) };
    }
  }

  if (!result.accepted) return reject(result);
  // classify() only accepts when the source exists and is approved.
  const labels = { contentType: result.contentType, gamePhase: result.gamePhase, reason: result.ruleId };
  return { accepted: true, video: buildVideo(candidate, source!, labels, "verified-publisher", checkedAt) };
}
