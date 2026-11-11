import type { ContentType, GamePhase } from "@/catalog/content-types";
import type { Source } from "@/catalog/sources";
import { TEAMS } from "@/catalog/teams";
import type { CandidateVideo } from "./candidate";

export const REJECTION_REASONS = [
  "UNVERIFIED_PUBLISHER",
  "MANUAL_EXCLUSION",
  "UNAVAILABLE_VIDEO",
  "UNSUPPORTED_FORMAT",
  "AI_GENERATED",
  "SYNTHETIC_VOICE",
  "GAMING_CONTENT",
  "BETTING_CONTENT",
  "FAN_EDIT",
  "REACTION_CONTENT",
  "UNRELATED_CONTENT",
  "CONTENT_TYPE_NOT_ALLOWED",
  "LOW_CONFIDENCE",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

export type Classification =
  | { accepted: true; contentType: ContentType; gamePhase: GamePhase | null; ruleId: string }
  | { accepted: false; rejection: RejectionReason; ruleId: string };

/** Shortest video the catalog accepts. Anything under a minute is a Short or a single-play clip. */
export const MIN_DURATION_SECONDS = 60;

function accept(contentType: ContentType, gamePhase: GamePhase | null, ruleId: string): Classification {
  return { accepted: true, contentType, gamePhase, ruleId };
}

function reject(rejection: RejectionReason, ruleId: string): Classification {
  return { accepted: false, rejection, ruleId };
}

// Titles are matched on vocabulary, not position: every team formats its
// titles differently (see docs/RESEARCH.md, section 5).

interface TitleRejectRule {
  id: string;
  rejection: RejectionReason;
  pattern: RegExp;
}

/**
 * Checked in order, before any rule can accept. These apply even to official
 * channels: a team's own podcast or 2K stream is still not what this site is for.
 */
const TITLE_REJECT_RULES: TitleRejectRule[] = [
  { id: "shorts-tag", rejection: "UNSUPPORTED_FORMAT", pattern: /#shorts?\b/i },
  // Two or more hashtags is how clips cut for the Shorts shelf are titled.
  { id: "hashtag-clip", rejection: "UNSUPPORTED_FORMAT", pattern: /#\w+.*#\w+/ },
  { id: "teaser", rejection: "UNSUPPORTED_FORMAT", pattern: /\b(teaser|trailer|coming soon|premieres?)\b/i },
  { id: "live-stream", rejection: "UNSUPPORTED_FORMAT", pattern: /\blive ?stream\b|🔴/i },
  {
    id: "synthetic-voice",
    rejection: "SYNTHETIC_VOICE",
    pattern: /\bAI[- ]voice\b|\bvoice[- ]clon\w*|\bcloned voice\b|\btext[- ]to[- ]speech\b|\bTTS\b/i,
  },
  {
    id: "ai-generated",
    rejection: "AI_GENERATED",
    pattern:
      /\bAI[- ](generated|made|cover|edit|remix|animation|animated|video|version)\b|\b(made|generated|created) (with|by|using) AI\b|\bdeepfake\w*|\bsora\b/i,
  },
  {
    id: "gaming",
    rejection: "GAMING_CONTENT",
    pattern:
      /\bNBA ?2K\d*\b|\b2K\d{2}\b|\b2K League\b|\bMyCAREER\b|\bMyTEAM\b|\bgameplay\b|\be-?sports\b|\bPS5\b|\bXbox\b|\bsimulation\b|\bFortnite\b|\bRoblox\b/i,
  },
  {
    id: "betting",
    rejection: "BETTING_CONTENT",
    pattern:
      /\b(bets?|betting|bettors?|odds|parlays?|sportsbook|wagers?|gambl\w*|draftkings|fanduel|betmgm|prizepicks|moneyline|point spread|over\/under|prop bets?|player props|fantasy (basketball|picks|advice)|best picks)\b/i,
  },
  {
    id: "fan-edit",
    rejection: "FAN_EDIT",
    pattern:
      /\b(mixtape|fan[- ]?made|fan edit|edits?|AMV|montage|tribute|slowed|reverb|phonk|capcut)\b/i,
  },
  { id: "reaction", rejection: "REACTION_CONTENT", pattern: /\breact(s|ed|ing|ions?)?\b/i },
  // Analysts talking about a game are commentary, even on an official channel.
  {
    id: "studio-commentary",
    rejection: "UNRELATED_CONTENT",
    pattern: /\bsounds? off\b|\bweighs? in\b|\bdebates?\b|\bhot takes?\b|\bpredictions?\b|\bpower rankings?\b|\bmock draft\b/i,
  },
  {
    id: "show-or-feature",
    rejection: "UNRELATED_CONTENT",
    pattern:
      /\bpodcast\b|\b(ep|episode)\.? ?\d+\b|\bs\d+,? ?e\d+\b|\bseason \d\b|\ball[- ]access\b|\bmini[- ]movie\b|\bhype video\b|\bmic'?d up\b|\bbehind the scenes\b|\bvlog\b|\bday in the life\b|\bhalftime\b/i,
  },
];

const HIGHLIGHT_WORD = /\bhighlights?\b/i;
const FULL_GAME_HIGHLIGHTS = /\b(full game|extended) highlights\b/i;
const PLAYER_HIGHLIGHT_WORDS = /\bplayer highlights\b|\bhighlight reel\b/i;
const TOP_PLAYS = /\btop \d+ plays\b|\btop plays\b|\bbest plays\b|\bplays of the (night|week|month|year)\b|\bnightly recap\b/i;

/** "30 PTS", "36-PT", "25 Points", "14 STRAIGHT PTS", "double-double". Scores like "109-93" do not count. */
const STAT_LINE =
  /\b\d{1,3}[- ]?(?:[a-z]+[- ])?(?:pts?|points?|rebs?|rebounds?|asts?|assists?|threes|3pm|3-pointers?|blocks?|steals?)\b|\b(?:double|triple)[- ]double\b/i;

/** Words that mean someone is talking to the media rather than playing. */
const SESSION_WORD = /\b(press conferences?|presser|media availability|availability|interviews?|media|sound)\b/i;

const SHOOTAROUND = /\bshootaround\b/i;
const PREGAME = /\bpre[- ]?game\b/i;
const POSTGAME = /\bpost[- ]?game\b|\bwalk[- ]?off interview\b|\bon[- ]court interview\b/i;
// A studio show is not a media session, even when it is called "Postgame Live".
const STUDIO_SHOW = /\b(show|live|report)\b/i;

const AVAILABILITY =
  /\bpress conferences?\b|\bmedia availability\b|\bpractice (sound|media|availability|interview)\b|\bexit interviews?\b/i;
const MEDIA_DAY = /\bmedia day\b/i;
const TALK_VERB = /\b(talks?|speaks?|discuss(es)?|breaks? down|recaps|explains?|reflects?|opens up)\b/i;
const INTERVIEW = /\binterviews?\b|\bone[- ]on[- ]one\b|\b1[- ]on[- ]1\b|\bsit[- ]?down\b|\bsits down\b|\bq&a\b/i;

const GENERIC_HIGHLIGHT_SUBJECTS = new Set(["", "game", "full game", "extended", "team", "postgame", "preseason", "summer league"]);

// Every way a title refers to a team on its own: "Suns", "Phoenix Suns", "Blazers".
const TEAM_REFERENCES = new Set<string>();
for (const team of TEAMS) {
  TEAM_REFERENCES.add(team.name.toLowerCase());
  TEAM_REFERENCES.add(`${team.city} ${team.name}`.toLowerCase());
  for (const name of team.matchupNames) TEAM_REFERENCES.add(name.toLowerCase());
}

function isTeamReference(text: string): boolean {
  return TEAM_REFERENCES.has(text.replace(/ preseason$/, "").trim());
}

// Two to four capitalised words: "Derik Queen", "Trey Murphy III", "Karlo Matković".
const PERSON_NAME = /^\p{Lu}[\p{L}.'-]*(?: \p{Lu}[\p{L}.'-]*){1,3}$/u;

/**
 * Finds what a highlights title says the highlights are of, by reading the
 * words just before "Highlights". "Cavs vs 76ers | Donovan Mitchell Highlights"
 * gives a player. "Phoenix Suns Highlights" and "Pistons vs. Lakers Highlights"
 * give a team, which means the whole game.
 */
function highlightSubject(title: string): "player" | "team" | "unknown" {
  const before = title.slice(0, title.search(HIGHLIGHT_WORD));
  // Teams separate title parts with "|", ":" or, in Detroit's case, a lone "l" or "I".
  const segments = before.split(/\s*[|:]\s*|\s+[lI]\s+/);
  const subject = (segments[segments.length - 1] ?? "").trim().replace(/ game$/i, "");
  const lower = subject.toLowerCase();

  if (GENERIC_HIGHLIGHT_SUBJECTS.has(lower)) return "unknown";
  if (isTeamReference(lower)) return "team";
  const matchup = /^(.+?) (?:vs\.?|at) (.+)$/.exec(lower);
  if (matchup && isTeamReference(matchup[1]) && isTeamReference(matchup[2])) return "team";
  return PERSON_NAME.test(subject) ? "player" : "unknown";
}

/**
 * Says whether the title marks the speaker as a coach, and whether the coach
 * is alone. "Coach Charles Lee and Sion James" is a group session, so it is not
 * labelled as a coach's press conference.
 */
export function coachSpeaker(title: string): "solo" | "group" | null {
  const match = /\b(?:head )?coach\b\s*(.*)$/i.exec(title);
  if (!match) return null;
  // Read the names after "Coach" up to the point where the title moves on.
  const names = match[1].split(/\s*[|:]\s*|\s+(?:on|talks?|post[- ]?game|pre[- ]?game|press|media|shootaround|practice|end of)\b/i)[0];
  return /,|&|\band\b/i.test(names) ? "group" : "solo";
}

function classifySession(title: string, gamePhase: GamePhase | null, ruleId: string): Classification {
  if (coachSpeaker(title) === "solo") {
    return accept("COACH_PRESS_CONFERENCE", gamePhase, `${ruleId}-coach`);
  }
  if (gamePhase === "pregame") return accept("PREGAME_INTERVIEW", gamePhase, ruleId);
  if (gamePhase === "postgame") return accept("POSTGAME_INTERVIEW", gamePhase, ruleId);
  return accept("MEDIA_AVAILABILITY", null, ruleId);
}

function classifyHighlights(title: string): Classification {
  if (FULL_GAME_HIGHLIGHTS.test(title)) return accept("GAME_HIGHLIGHTS", null, "highlights-full-game");
  if (PLAYER_HIGHLIGHT_WORDS.test(title)) return accept("PLAYER_HIGHLIGHTS", null, "highlights-player-words");

  const subject = highlightSubject(title);
  // "Phoenix Suns Highlights" is the team's game even when the title also quotes a stat.
  if (subject === "team") return accept("GAME_HIGHLIGHTS", null, "highlights-team");
  if (STAT_LINE.test(title)) return accept("PLAYER_HIGHLIGHTS", null, "highlights-stat-line");
  if (subject === "player") return accept("PLAYER_HIGHLIGHTS", null, "highlights-named-player");
  return accept("GAME_HIGHLIGHTS", null, "highlights-game");
}

/** Decides from the title alone. Exported so the rules can be tested without a full candidate. */
export function classifyTitle(rawTitle: string): Classification {
  const title = rawTitle.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

  for (const rule of TITLE_REJECT_RULES) {
    if (rule.pattern.test(title)) return reject(rule.rejection, rule.id);
  }

  const isSession = SESSION_WORD.test(title);

  if (HIGHLIGHT_WORD.test(title) && !isSession) return classifyHighlights(title);
  if (TOP_PLAYS.test(title)) return accept("TOP_PLAYS", null, "top-plays");

  if (SHOOTAROUND.test(title)) return classifySession(title, "pregame", "shootaround");
  if (PREGAME.test(title) && isSession) return classifySession(title, "pregame", "pregame-session");
  if (POSTGAME.test(title) && !STUDIO_SHOW.test(title)) return classifySession(title, "postgame", "postgame-session");

  if (AVAILABILITY.test(title)) return classifySession(title, null, "availability");
  if (MEDIA_DAY.test(title) && TALK_VERB.test(title)) return classifySession(title, null, "media-day");
  if (INTERVIEW.test(title)) return accept("OFFICIAL_BASKETBALL_INTERVIEW", null, "interview");
  if (TALK_VERB.test(title)) return accept("OFFICIAL_BASKETBALL_INTERVIEW", null, "talk-verb");

  // Official channels title single-player highlight clips with the stat line
  // and nothing else: "Kyrie Irving (35 points) vs. Brooklyn Nets".
  if (STAT_LINE.test(title)) return accept("PLAYER_HIGHLIGHTS", null, "stat-line-title");

  return reject("LOW_CONFIDENCE", "no-rule-matched");
}

/** Checks that need metadata the Atom feeds do not carry. Unknown values (null) pass. */
function classifyAvailability(video: CandidateVideo): Classification | null {
  if (video.privacyStatus !== null && video.privacyStatus !== "public") {
    return reject("UNAVAILABLE_VIDEO", "not-public");
  }
  if (video.embeddable === false) return reject("UNAVAILABLE_VIDEO", "not-embeddable");
  if (video.liveBroadcast !== null && video.liveBroadcast !== "none") {
    return reject("UNSUPPORTED_FORMAT", "live-broadcast");
  }
  if (video.isVertical === true) return reject("UNSUPPORTED_FORMAT", "vertical-video");
  if (video.durationSeconds !== null && video.durationSeconds < MIN_DURATION_SECONDS) {
    return reject("UNSUPPORTED_FORMAT", "under-one-minute");
  }
  return null;
}

/**
 * The full decision for one discovered video. `source` is the registry entry
 * for the video's channel, or undefined when the channel is not approved.
 */
export function classify(video: CandidateVideo, source: Source | undefined): Classification {
  if (!source || source.status !== "approved") return reject("UNVERIFIED_PUBLISHER", "channel-not-approved");

  const unavailable = classifyAvailability(video);
  if (unavailable) return unavailable;

  const result = classifyTitle(video.title);
  if (result.accepted && !source.allowedContentTypes.includes(result.contentType)) {
    return reject("CONTENT_TYPE_NOT_ALLOWED", "type-not-allowed-for-source");
  }
  return result;
}
