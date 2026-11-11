import { describe, expect, it } from "vitest";
import { makeCandidate, makeSource } from "@/test/fixtures";
import { classify, classifyTitle, coachSpeaker } from "./classify";

// Every accepted title below is a real upload from the named official channel,
// sampled on 2026-11-11. Titles under "rejects" marked (synthetic) were written
// for the test because official channels do not publish that kind of video.

type Expected = [title: string, contentType: string, gamePhase: string | null];

function expectAccepted(cases: Expected[]) {
  for (const [title, contentType, gamePhase] of cases) {
    const result = classifyTitle(title);
    expect(result, title).toMatchObject({ accepted: true, contentType, gamePhase });
  }
}

function expectRejected(cases: [title: string, rejection: string][]) {
  for (const [title, rejection] of cases) {
    const result = classifyTitle(title);
    expect(result, title).toMatchObject({ accepted: false, rejection });
  }
}

describe("classifyTitle accepts", () => {
  it("full-game highlights", () => {
    expectAccepted([
      ["THUNDER at TRAIL BLAZERS | FULL GAME HIGHLIGHTS | November 10, 2026", "GAME_HIGHLIGHTS", null], // NBA
      ["EXTENDED: CELTICS at 76ERS | FULL GAME HIGHLIGHTS | November 10, 2026", "GAME_HIGHLIGHTS", null], // NBA
      ["Cavs vs 76ers | Game Highlights | 11.06.2026", "GAME_HIGHLIGHTS", null], // Cavaliers
      ["Memphis Grizzlies Highlights vs Toronto Raptors", "GAME_HIGHLIGHTS", null], // Grizzlies
      ["Detroit Pistons vs. Los Angeles Lakers Highlights | 11.08.26 #NBA", "GAME_HIGHLIGHTS", null], // Pistons
      ["Highlights: Bucks 97 - Celtics 117 | 11.8.26", "GAME_HIGHLIGHTS", null], // Bucks
      ["Celtics fall to Rockets 109-93 in Houston | Extended Highlights", "GAME_HIGHLIGHTS", null], // Celtics
      ["POSTGAME HIGHLIGHTS: ORLANDO MAGIC VS. SACRAMENTO KINGS 11.10.26 PRESENTED BY PLANET FITNESS", "GAME_HIGHLIGHTS", null], // Magic
    ]);
  });

  it("a team's own highlights as the game even when the title quotes a stat", () => {
    expectAccepted([
      ["EVERY TRIPLE in Suns Season-High 22 3PM vs Los Angeles Clippers | Phoenix Suns Highlights", "GAME_HIGHLIGHTS", null], // Suns
      ["Jayson Tatum & Paul George combine for 48 points in win over Bucks | Extended Highlights", "GAME_HIGHLIGHTS", null], // Celtics
    ]);
  });

  it("player highlights named by player, stat line or wording", () => {
    expectAccepted([
      ["Cameron Boozer Highlights vs Toronto Raptors", "PLAYER_HIGHLIGHTS", null], // Grizzlies
      ["Cavs vs 76ers | Donovan Mitchell Highlights | 11.06.2026", "PLAYER_HIGHLIGHTS", null], // Cavaliers
      ["Daniss Jenkins Highlights  l  Pistons vs Wizards  l 11.09.26 #NBA", "PLAYER_HIGHLIGHTS", null], // Pistons
      ["Karlo Matković Highlights vs. Minnesota Timberwolves 11/6/26", "PLAYER_HIGHLIGHTS", null], // Pelicans
      ["Game Highlights | Naz Reid 25 PTS and 13 REB as Hornets Take Down Cavs | 11/9/2026", "PLAYER_HIGHLIGHTS", null], // Hornets
      ["Highlights: Anthony Davis secures double-double vs. Hawks", "PLAYER_HIGHLIGHTS", null], // Wizards
      ["OG Anunoby HIGHLIGHT REEL vs Milwaukee | November 10, 2026", "PLAYER_HIGHLIGHTS", null], // Knicks
      ["Darius Garland: Double-Double vs. Pelicans Highlights | LA Clippers", "PLAYER_HIGHLIGHTS", null], // Clippers
    ]);
  });

  it("stat-line titles that never say highlights", () => {
    expectAccepted([
      ["Kyrie Irving (35 points) vs. Indiana Pacers | November 9, 2026", "PLAYER_HIGHLIGHTS", null], // Mavericks
      ["Giannis Antetokounmpo DOMINATED with 30 PTS & 11 REB In Utah| November 10, 2026", "PLAYER_HIGHLIGHTS", null], // NBA
      ["Paul George Scores 14 STRAIGHT PTS In The 4TH in Philly (UNCUT) | November 10, 2026", "PLAYER_HIGHLIGHTS", null], // NBA
      ["Keyonte George scores 39 pts against Pelicans 🎥", "PLAYER_HIGHLIGHTS", null], // Jazz
    ]);
  });

  it("official compilations", () => {
    expectAccepted([
      ["NBA's Top 10 Plays of the Night | November 10, 2026", "TOP_PLAYS", null], // NBA
      ["NBA's Nightly Recap | November 10, 2026", "TOP_PLAYS", null], // NBA
      ["Golden State Warriors Plays of the Week | Week 3 (2026-27 NBA Season)", "TOP_PLAYS", null], // Warriors
    ]);
  });

  it("postgame sessions in every team's wording", () => {
    expectAccepted([
      ["Hawks vs. Lakers Postgame Press Conference: Dyson Daniels", "POSTGAME_INTERVIEW", "postgame"], // Hawks
      ["Cavs at Hornets | Kenny Atkinson Post Game | 11.09.2026", "POSTGAME_INTERVIEW", "postgame"], // Cavaliers
      ["Post Game Press Conference l Ausar Thompson l Pistons at Hornets   11.04.26 #NBA", "POSTGAME_INTERVIEW", "postgame"], // Pistons
      ['"We Know What It Takes To Win." | Rudy Gobert Postgame Sound | 11.8.26', "POSTGAME_INTERVIEW", "postgame"], // Timberwolves
      ["Ty Jerome Walk-Off Interview | Grizzlies vs. Raptors", "POSTGAME_INTERVIEW", "postgame"], // Grizzlies
      ["Jordan Goodwin Postgame On-Court Interview after Suns win against Los Angeles Clippers | 11-10-26", "POSTGAME_INTERVIEW", "postgame"], // Suns
      ["Jordan Clarkson Postgame Media | November 10, 2026", "POSTGAME_INTERVIEW", "postgame"], // Knicks
      ["Full Denver Nuggets Postgame Media Availability vs. HOU 🎙", "POSTGAME_INTERVIEW", "postgame"], // Nuggets
    ]);
  });

  it("pregame and shootaround sessions", () => {
    expectAccepted([
      ["Coby White Shootaround Media Availability | 11/2/26", "PREGAME_INTERVIEW", "pregame"], // Hornets
      ["SHOOTAROUND SOUND: ORLANDO MAGIC VS. PHOENIX SUNS | FRANZ WAGNER & DESMOND BANE", "PREGAME_INTERVIEW", "pregame"], // Magic
      ["Herb Jones on Warriors loss, upcoming homestand | Pelicans-Nets Shootaround 11/11/2026", "PREGAME_INTERVIEW", "pregame"], // Pelicans
      ["Erik Spoelstra Pregame Press Conference", "PREGAME_INTERVIEW", "pregame"], // (synthetic wording)
    ]);
  });

  it("a coach speaking alone as a coach press conference, keeping the game phase", () => {
    expectAccepted([
      ["Hawks vs. Lakers Postgame Press Conference: Head Coach Quin Snyder", "COACH_PRESS_CONFERENCE", "postgame"], // Hawks
      ["Hornets vs Cavaliers: Coach Charles Lee Postgame Media Availability | 11/9/2026", "COACH_PRESS_CONFERENCE", "postgame"], // Hornets
      ["Coach Daigneault on Team's Tenacity and Energy | Postgame Media | November 6, 2026", "COACH_PRESS_CONFERENCE", "postgame"], // Thunder
      ["Philadelphia 76ers Postgame Media Availability 🎙️ | Coach Nurse | 11.04.26", "COACH_PRESS_CONFERENCE", "postgame"], // 76ers
      ["Coach Christie End of Season Exit Interview | 4.15.26", "COACH_PRESS_CONFERENCE", null], // Kings
    ]);
  });

  it("a coach sharing the session as an ordinary session", () => {
    expectAccepted([
      ["Hornets at Nets: Coach Charles Lee and Sion James Postgame Media Availability | 11/4/2026", "POSTGAME_INTERVIEW", "postgame"], // Hornets
      ["POSTGAME SOUND: ORLANDO MAGIC VS. SACRAMENTO KINGS | COACH SWEENEY, FRANZ WAGNER & ANTHONY BLACK", "POSTGAME_INTERVIEW", "postgame"], // Magic
      ["Media Availability: Head Coach Brian Keefe, Trae Young, and AJ Dybantsa | 11.7.26", "MEDIA_AVAILABILITY", null], // Wizards
    ]);
  });

  it("practice availability and press conferences with no stated game phase", () => {
    expectAccepted([
      ["Practice Media Availability (10/27/26) | LA Clippers", "MEDIA_AVAILABILITY", null], // Clippers
      ["Tuomas Iisalo Press Conference | Grizzlies vs. Raptors", "MEDIA_AVAILABILITY", null], // Grizzlies
      ['"[Trey] Is A Smart Guy" | Pablo Prigioni Practice Sound | 11.10.26', "MEDIA_AVAILABILITY", null], // Timberwolves
      ["Lakers Start of Season Press Conference: Rob Pelinka & JJ Redick", "MEDIA_AVAILABILITY", null], // Lakers
      ["Luka, Austin and the Squad Discuss the Season | Lakers Media Day 2026", "MEDIA_AVAILABILITY", null], // Lakers
    ]);
  });

  it("interviews, including ones that quote a stat line", () => {
    expectAccepted([
      ["One on One with Ajay Mitchell | November 6, 2026 | OKC Thunder", "OFFICIAL_BASKETBALL_INTERVIEW", null], // Thunder
      ["Stars & Stripes Sit-Down with Sixers Forward Jabari Walker", "OFFICIAL_BASKETBALL_INTERVIEW", null], // 76ers
      ["Paul George Breaks Down His 36-PT Performance In Philly", "OFFICIAL_BASKETBALL_INTERVIEW", null], // NBA
      ["Stephen Curry Recaps 41-Point Performance vs. Magic", "OFFICIAL_BASKETBALL_INTERVIEW", null], // Warriors
      ["Will Hardy talks about Utah’s fight in the fourth, Collier’s contributions vs Miami", "OFFICIAL_BASKETBALL_INTERVIEW", null], // Jazz
    ]);
  });
});

describe("classifyTitle rejects", () => {
  it("shorts, hashtag clips, teasers and live streams", () => {
    expectRejected([
      ["Nothing but good vibes from Coach Jimmy 😂 | #shorts", "UNSUPPORTED_FORMAT"], // Warriors
      ["JAYLEN BROWN TWO HAND JAM ⚡️ #76ers #sixers #jaylenbrown", "UNSUPPORTED_FORMAT"], // 76ers
      ["Caleb Wilson opens up about how his College Basketball career ended #nba #chicagobulls", "UNSUPPORTED_FORMAT"], // Bulls
      ["TEASER: Maxime Raynaud Sits Down with Deuce and Mo", "UNSUPPORTED_FORMAT"], // Kings
      ["🔴 LIVE: Postgame Press Conference", "UNSUPPORTED_FORMAT"], // (synthetic)
    ]);
  });

  it("podcasts, documentaries, hype videos and studio commentary from official channels", () => {
    expectRejected([
      ["Coop, There it is!| Take Dat Wit You Ep 166 | 11/10/26 | Podcast", "UNRELATED_CONTENT"], // Mavericks
      ["Brooklyn Nets All-Access: Inside Training Camp, Preseason & Beyond the Court", "UNRELATED_CONTENT"], // Nets
      ["Los Angeles Lakers 2026-27 Season Hype Video", "UNRELATED_CONTENT"], // Lakers
      ["A Day in the Life with Mikel Brown Jr. at NBA Media Day", "UNRELATED_CONTENT"], // Nets
      ["How Walker Kessler & Luka Dončić Are Setting the Tone for the 2026 Lakers | Mic'd Up", "UNRELATED_CONTENT"], // Lakers
      ["Isaiah Thomas Sounds Off On Paul George's 36-PT Performance In Philly! | The Association", "UNRELATED_CONTENT"], // NBA
      ["Kobe Brown Joins Quinn Buckner for Pacers Playroom Season 2", "UNRELATED_CONTENT"], // Pacers
    ]);
  });

  it("reaction videos", () => {
    expectRejected([
      ["Ian Eagle REACTS to His Iconic Nets Calls", "REACTION_CONTENT"], // Nets
      ["Reacting to LeBron's Postgame Interview", "REACTION_CONTENT"], // (synthetic)
    ]);
  });

  it("fan edits and mixtapes (synthetic)", () => {
    expectRejected([
      ["Stephen Curry Mixtape - Night Night 🔥 Highlights", "FAN_EDIT"],
      ["LeBron James 4K Edit | Postgame Interview vibes", "FAN_EDIT"],
      ["Kobe Bryant Tribute Montage - Game Highlights", "FAN_EDIT"],
      ["Luka Doncic highlights (slowed + reverb)", "FAN_EDIT"],
    ]);
  });

  it("AI-generated video and synthetic voices (synthetic)", () => {
    expectRejected([
      ["LeBron James Postgame Interview (AI Generated)", "AI_GENERATED"],
      ["What if Jordan played today? Made with AI | Full Game Highlights", "AI_GENERATED"],
      ["Shaq AI Voice reads the Postgame Press Conference", "SYNTHETIC_VOICE"],
      ["Charles Barkley voice clone | Postgame Interview", "SYNTHETIC_VOICE"],
    ]);
  });

  it("gaming content (synthetic)", () => {
    expectRejected([
      ["NBA 2K27 Lakers vs Celtics Full Game Highlights", "GAMING_CONTENT"],
      ["LAKERS at CELTICS | FULL GAME HIGHLIGHTS | 2K26 Simulation", "GAMING_CONTENT"],
      ["MyCAREER Postgame Interview", "GAMING_CONTENT"],
    ]);
  });

  it("betting content (synthetic)", () => {
    expectRejected([
      ["Best Bets Tonight: Lakers vs Celtics Game Highlights Preview", "BETTING_CONTENT"],
      ["NBA Player Props and Parlays | Postgame Interview Breakdown", "BETTING_CONTENT"],
      ["DraftKings Postgame Press Conference Odds Update", "BETTING_CONTENT"],
    ]);
  });

  it("official uploads whose kind the title does not establish", () => {
    expectRejected([
      ["New York Knicks Defeat the Milwaukee Bucks at Madison Square Garden | November 10, 2026", "LOW_CONFIDENCE"], // Knicks
      ["Stephen Curry on Facing Klay Thompson & Warriors' Young Core | Nov. 6, 2026", "LOW_CONFIDENCE"], // Warriors
      ["Caleb Wilson: My First Media Day", "LOW_CONFIDENCE"], // Bulls
      ["The Skelly Celly Is Always Ready | Practice Report", "LOW_CONFIDENCE"], // Timberwolves
      ["Buddy Hield shares his love for Bahamian food & answers your questions", "LOW_CONFIDENCE"], // Bulls
      ["They Started 11-30… Then Everything Changed", "LOW_CONFIDENCE"], // Heat
    ]);
  });

  it("studio shows that borrow the word postgame", () => {
    expectRejected([
      ["Lakers Postgame Live", "LOW_CONFIDENCE"], // (synthetic)
      ["Celtics Postgame Show presented by a sponsor", "LOW_CONFIDENCE"], // (synthetic)
    ]);
  });

  it("names the rule behind every decision", () => {
    expect(classifyTitle("NBA's Top 10 Plays of the Night | November 10, 2026").ruleId).toBe("top-plays");
    expect(classifyTitle("Lakers Postgame Live").ruleId).toBe("no-rule-matched");
    expect(classifyTitle("NBA 2K27 gameplay").ruleId).toBe("gaming");
  });
});

describe("coachSpeaker", () => {
  it("is null when the title does not mark a coach", () => {
    expect(coachSpeaker("Cavs at Hornets | Kenny Atkinson Post Game | 11.09.2026")).toBeNull();
  });

  it("tells a coach alone from a coach in a group", () => {
    expect(coachSpeaker("Head Coach Jordan Ott Postgame Media Availability  | 11-10-26")).toBe("solo");
    expect(coachSpeaker("Coach Daigneault on Team's Tenacity and Energy | Postgame Media")).toBe("solo");
    expect(coachSpeaker("Postgame Media Availability with Coach Daigneault, JMac, and Shai | OKC Thunder")).toBe("group");
    expect(coachSpeaker("PRACTICE SOUND: COACH SWEENEY & DESMOND BANE BY SAS")).toBe("group");
  });
});

describe("classify", () => {
  const league = makeSource();

  it("rejects any video whose channel is not an approved source", () => {
    const video = makeCandidate();
    expect(classify(video, undefined)).toMatchObject({ accepted: false, rejection: "UNVERIFIED_PUBLISHER" });
    expect(classify(video, makeSource({ status: "candidate" }))).toMatchObject({ rejection: "UNVERIFIED_PUBLISHER" });
    expect(classify(video, makeSource({ status: "suspended" }))).toMatchObject({ rejection: "UNVERIFIED_PUBLISHER" });
  });

  it("accepts an official highlight when nothing is known about its availability", () => {
    expect(classify(makeCandidate(), league)).toMatchObject({ accepted: true, contentType: "GAME_HIGHLIGHTS" });
  });

  it("rejects private, unlisted and unembeddable videos", () => {
    expect(classify(makeCandidate({ privacyStatus: "private" }), league)).toMatchObject({ rejection: "UNAVAILABLE_VIDEO" });
    expect(classify(makeCandidate({ privacyStatus: "unlisted" }), league)).toMatchObject({ rejection: "UNAVAILABLE_VIDEO" });
    expect(classify(makeCandidate({ embeddable: false }), league)).toMatchObject({ rejection: "UNAVAILABLE_VIDEO", ruleId: "not-embeddable" });
  });

  it("rejects live broadcasts, vertical videos and anything under a minute", () => {
    expect(classify(makeCandidate({ liveBroadcast: "live" }), league)).toMatchObject({ rejection: "UNSUPPORTED_FORMAT" });
    expect(classify(makeCandidate({ liveBroadcast: "upcoming" }), league)).toMatchObject({ rejection: "UNSUPPORTED_FORMAT" });
    expect(classify(makeCandidate({ isVertical: true }), league)).toMatchObject({ rejection: "UNSUPPORTED_FORMAT" });
    expect(classify(makeCandidate({ durationSeconds: 59 }), league)).toMatchObject({ rejection: "UNSUPPORTED_FORMAT" });
    expect(classify(makeCandidate({ durationSeconds: 60 }), league)).toMatchObject({ accepted: true });
  });

  it("respects the content types a source is allowed to contribute", () => {
    const interviewsOnly = makeSource({ allowedContentTypes: ["POSTGAME_INTERVIEW"] });
    expect(classify(makeCandidate(), interviewsOnly)).toMatchObject({ rejection: "CONTENT_TYPE_NOT_ALLOWED" });
  });
});
