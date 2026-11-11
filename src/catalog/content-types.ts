/**
 * The kinds of video NBATube accepts. These are NBATube's own labels, assigned
 * by the classifier. They are never presented as coming from YouTube.
 */
export const CONTENT_TYPES = [
  "GAME_HIGHLIGHTS",
  "PLAYER_HIGHLIGHTS",
  "TOP_PLAYS",
  "PREGAME_INTERVIEW",
  "POSTGAME_INTERVIEW",
  "COACH_PRESS_CONFERENCE",
  "MEDIA_AVAILABILITY",
  "OFFICIAL_BASKETBALL_INTERVIEW",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export const GAME_PHASES = ["pregame", "postgame"] as const;

export type GamePhase = (typeof GAME_PHASES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  GAME_HIGHLIGHTS: "Game highlights",
  PLAYER_HIGHLIGHTS: "Player highlights",
  TOP_PLAYS: "Top plays",
  PREGAME_INTERVIEW: "Pregame",
  POSTGAME_INTERVIEW: "Postgame",
  COACH_PRESS_CONFERENCE: "Coach",
  MEDIA_AVAILABILITY: "Media availability",
  OFFICIAL_BASKETBALL_INTERVIEW: "Interview",
};

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

/**
 * The four shelves of the site. Every video sits on exactly one, so the
 * section pages never show the same video twice.
 */
export const SECTIONS = [
  {
    id: "highlights",
    title: "Highlights",
    path: "/highlights",
    description: "Official game recaps, player highlights and top plays.",
  },
  {
    id: "pregame",
    title: "Pregame",
    path: "/pregame",
    description: "Shootaround and pregame media sessions.",
  },
  {
    id: "postgame",
    title: "Postgame",
    path: "/postgame",
    description: "Postgame press conferences and interviews with players and coaches.",
  },
  {
    id: "interviews",
    title: "Interviews",
    path: "/interviews",
    description: "Practice availability, media days and sit-down interviews.",
  },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];

const HIGHLIGHT_TYPES: ContentType[] = ["GAME_HIGHLIGHTS", "PLAYER_HIGHLIGHTS", "TOP_PLAYS"];

export function sectionOf(labels: {
  contentType: ContentType;
  gamePhase: GamePhase | null;
}): SectionId {
  if (HIGHLIGHT_TYPES.includes(labels.contentType)) return "highlights";
  if (labels.gamePhase === "pregame") return "pregame";
  if (labels.gamePhase === "postgame") return "postgame";
  return "interviews";
}

export function getSection(id: SectionId) {
  const section = SECTIONS.find((candidate) => candidate.id === id);
  if (!section) throw new Error(`Unknown section: ${id}`);
  return section;
}
