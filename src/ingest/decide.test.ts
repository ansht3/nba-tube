import { describe, expect, it } from "vitest";
import { videoSchema } from "@/catalog/schema";
import { makeCandidate, makeSource } from "@/test/fixtures";
import { decide, opponentOf, teamIdsFor } from "./decide";
import { NO_OVERRIDES, type Overrides } from "./overrides";

const NOW = new Date("2026-11-11T18:00:00.000Z");
const league = makeSource();
const hawks = makeSource({ channelId: "UCpfcwELvR1wtcRJ0UxNXHYw", name: "Atlanta Hawks", handle: "@ATLHawks", publisherType: "team", teamId: "ATL" });

describe("teamIdsFor", () => {
  it("tags a team channel's video with that team and an exactly named opponent", () => {
    const video = makeCandidate({ title: "Hawks vs. Lakers Postgame Press Conference: Dyson Daniels" });
    expect(teamIdsFor(video, hawks)).toEqual(["ATL", "LAL"]);
    const other = makeCandidate({ title: "Hawks Practice Report | November 10, 2026" });
    expect(teamIdsFor(other, hawks)).toEqual(["ATL"]);
  });

  it("reads both teams from the league channel's matchup format", () => {
    expect(teamIdsFor(makeCandidate({ title: "THUNDER at TRAIL BLAZERS | FULL GAME HIGHLIGHTS | November 10, 2026" }), league)).toEqual(["OKC", "POR"]);
    expect(teamIdsFor(makeCandidate({ title: "EXTENDED: CELTICS at 76ERS | FULL GAME HIGHLIGHTS | November 10, 2026" }), league)).toEqual(["BOS", "PHI"]);
  });

  it("assigns no team when the league title is not a matchup", () => {
    const titles = [
      "NBA's Top 10 Plays of the Night | November 10, 2026",
      "Paul George Was UNSTOPPABLE In Philly With 36 PTS (6 THREES) 🔥",
      "Giannis Antetokounmpo DOMINATED with 30 PTS & 11 REB In Utah| November 10, 2026",
    ];
    for (const title of titles) expect(teamIdsFor(makeCandidate({ title }), league), title).toEqual([]);
  });

  it("assigns no team when either name is not an exact team name", () => {
    const titles = [
      "TEAM LEBRON at TEAM GIANNIS | FULL GAME HIGHLIGHTS | February 15, 2026",
      "THUNDER at BLAZERS FANS | FULL GAME HIGHLIGHTS | November 10, 2026",
      "LAKERS at LAKERS | FULL GAME HIGHLIGHTS | November 10, 2026",
    ];
    for (const title of titles) expect(teamIdsFor(makeCandidate({ title }), league), title).toEqual([]);
  });
});

describe("opponentOf", () => {
  // Real titles from team channels (see classify.test.ts), own team second.
  const cases: [string, string, string | null][] = [
    ["Hawks vs. Lakers Postgame Press Conference: Dyson Daniels", "ATL", "LAL"],
    ["Hawks vs. Lakers Postgame Press Conference: Dyson Daniels", "LAL", "ATL"],
    ["Cavs at Hornets | Kenny Atkinson Post Game | 11.09.2026", "CLE", "CHA"],
    ["Cavs vs 76ers | Game Highlights | 11.06.2026", "CLE", "PHI"],
    ["Memphis Grizzlies Highlights vs Toronto Raptors", "MEM", "TOR"],
    ["Detroit Pistons vs. Los Angeles Lakers Highlights | 11.08.26 #NBA", "DET", "LAL"],
    ["EVERY TRIPLE in Suns Season-High 22 3PM vs Los Angeles Clippers | Phoenix Suns Highlights", "PHX", "LAC"],
    ["Daniss Jenkins Highlights  l  Pistons vs Wizards  l 11.09.26 #NBA", "DET", "WAS"],
    ["Post Game Press Conference l Ausar Thompson l Pistons at Hornets   11.04.26 #NBA", "DET", "CHA"],
    ["Full Denver Nuggets Postgame Media Availability vs. HOU 🎙", "DEN", "HOU"],
    ["Kyrie Irving (35 points) vs. Indiana Pacers | November 9, 2026", "DAL", "IND"],
    ["Highlights: Anthony Davis secures double-double vs. Hawks", "WAS", "ATL"],
    // A city alone is not a team, and "at" a place is not an opponent.
    ["OG Anunoby HIGHLIGHT REEL vs Milwaukee | November 10, 2026", "NYK", null],
    ["New York Knicks Defeat the Milwaukee Bucks at Madison Square Garden | November 10, 2026", "NYK", null],
    ["Ty Jerome Walk-Off Interview | Grizzlies vs. Raptors", "MEM", "TOR"],
    ["Inside the Locker Room | Media Day 2026", "BOS", null],
    // Lower-case "hou" is a word, not a code.
    ["Shooting drills vs hou style defense", "DEN", null],
  ];
  for (const [title, own, expected] of cases) {
    it(`${own}: ${title}`, () => expect(opponentOf(title, own)).toBe(expected));
  }
});

describe("decide", () => {
  it("turns an accepted candidate into a valid catalog record", () => {
    const decision = decide(makeCandidate(), league, NO_OVERRIDES, NOW);
    expect(decision.accepted).toBe(true);
    if (!decision.accepted) return;

    expect(() => videoSchema.parse(decision.video)).not.toThrow();
    expect(decision.video.labels).toEqual({
      contentType: "GAME_HIGHLIGHTS",
      gamePhase: null,
      teamIds: ["OKC", "POR"],
      playerNames: [],
      reason: "highlights-full-game",
    });
    expect(decision.video.provenance).toEqual({
      publisherType: "league",
      discoveryMethod: "channel-feed",
      verificationStatus: "verified-publisher",
      metadataCheckedAt: "2026-11-11T18:00:00.000Z",
    });
  });

  it("keeps the title exactly as YouTube provided it", () => {
    const title = "  Paul George Was UNSTOPPABLE In Philly With 36 PTS (6 THREES) 🔥";
    const decision = decide(makeCandidate({ title }), league, NO_OVERRIDES, NOW);
    expect(decision.accepted && decision.video.title).toBe(title);
  });

  it("passes on the classifier's rejection and its rule", () => {
    const decision = decide(makeCandidate({ title: "Los Angeles Lakers 2026-27 Season Hype Video" }), league, NO_OVERRIDES, NOW);
    expect(decision).toEqual({ accepted: false, rejection: "UNRELATED_CONTENT", ruleId: "show-or-feature" });
  });

  it("applies a manual exclusion to a video the rules would accept", () => {
    const overrides: Overrides = { schemaVersion: 1, include: [], exclude: [{ youtubeId: "_7TMNmEtbBk", note: "Wrong game in the title" }] };
    expect(decide(makeCandidate(), league, overrides, NOW)).toMatchObject({ accepted: false, rejection: "MANUAL_EXCLUSION" });
  });

  it("applies a manual inclusion to a video the rules were unsure about", () => {
    const candidate = makeCandidate({ title: "Stephen Curry on Facing Klay Thompson & Warriors' Young Core | Nov. 6, 2026" });
    const overrides: Overrides = {
      schemaVersion: 1,
      include: [{ youtubeId: candidate.youtubeId, contentType: "PREGAME_INTERVIEW", gamePhase: "pregame", teamIds: ["GSW"], note: "Shootaround availability" }],
      exclude: [],
    };
    const decision = decide(candidate, league, overrides, NOW);
    expect(decision.accepted && decision.video.labels).toMatchObject({ contentType: "PREGAME_INTERVIEW", gamePhase: "pregame", teamIds: ["GSW"], reason: "manual-inclusion" });
    expect(decision.accepted && decision.video.provenance.verificationStatus).toBe("manual-review");
  });

  it("does not let a manual inclusion bypass the publisher check or an unplayable video", () => {
    const include = [{ youtubeId: "_7TMNmEtbBk", contentType: "TOP_PLAYS" as const, gamePhase: null, note: "please" }];
    const overrides: Overrides = { schemaVersion: 1, include, exclude: [] };

    expect(decide(makeCandidate(), undefined, overrides, NOW)).toMatchObject({ accepted: false, rejection: "UNVERIFIED_PUBLISHER" });
    expect(decide(makeCandidate({ embeddable: false }), league, overrides, NOW)).toMatchObject({ accepted: false, rejection: "UNAVAILABLE_VIDEO" });
  });
});
