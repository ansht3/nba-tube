import type { Video } from "@/catalog/schema";
import type { Source } from "@/catalog/sources";
import type { CandidateVideo } from "@/ingest/candidate";

/** A real video from the NBA channel, used as the base for test records. */
export function makeVideo(overrides: Partial<Video> = {}): Video {
  return {
    youtubeId: "_7TMNmEtbBk",
    title: "NBA's Top 10 Plays of the Night | November 10, 2026",
    channelId: "UCWJ2lWNubArHWmf3FIHbfcQ",
    channelTitle: "NBA",
    thumbnailUrl: "https://i.ytimg.com/vi/_7TMNmEtbBk/hqdefault.jpg",
    publishedAt: "2026-11-11T17:00:01+00:00",
    durationSeconds: null,
    embeddable: null,
    labels: { contentType: "TOP_PLAYS", gamePhase: null, teamIds: [], playerNames: [], reason: "top-plays" },
    provenance: {
      publisherType: "league",
      discoveryMethod: "channel-feed",
      verificationStatus: "verified-publisher",
      metadataCheckedAt: "2026-11-11T18:00:00.000Z",
    },
    ...overrides,
  };
}

/** Video ids must be 11 characters. This pads a short readable name so tests stay legible. */
export function testId(name: string): string {
  return name.padEnd(11, "_").slice(0, 11);
}

export function makeCandidate(overrides: Partial<CandidateVideo> = {}): CandidateVideo {
  return {
    youtubeId: "_7TMNmEtbBk",
    title: "THUNDER at TRAIL BLAZERS | FULL GAME HIGHLIGHTS | November 10, 2026",
    channelId: "UCWJ2lWNubArHWmf3FIHbfcQ",
    channelTitle: "NBA",
    thumbnailUrl: "https://i.ytimg.com/vi/_7TMNmEtbBk/hqdefault.jpg",
    publishedAt: "2026-11-11T06:00:00+00:00",
    durationSeconds: null,
    embeddable: null,
    privacyStatus: null,
    liveBroadcast: null,
    isVertical: null,
    discoveryMethod: "channel-feed",
    ...overrides,
  };
}

export function makeSource(overrides: Partial<Source> = {}): Source {
  return {
    channelId: "UCWJ2lWNubArHWmf3FIHbfcQ",
    name: "NBA",
    handle: "@NBA",
    publisherType: "league",
    status: "approved",
    teamId: null,
    allowedContentTypes: [
      "GAME_HIGHLIGHTS",
      "PLAYER_HIGHLIGHTS",
      "TOP_PLAYS",
      "PREGAME_INTERVIEW",
      "POSTGAME_INTERVIEW",
      "COACH_PRESS_CONFERENCE",
      "MEDIA_AVAILABILITY",
      "OFFICIAL_BASKETBALL_INTERVIEW",
    ],
    verification: {
      method: "youtube-badge-and-activity",
      evidence: "https://www.youtube.com/@NBA",
      verifiedAt: "2026-11-11",
    },
    ...overrides,
  };
}
