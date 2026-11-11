import { describe, expect, it } from "vitest";
import { CONTENT_TYPES, CONTENT_TYPE_LABELS, SECTIONS, isContentType, sectionOf } from "./content-types";

describe("content types", () => {
  it("has a label for every type", () => {
    for (const type of CONTENT_TYPES) expect(CONTENT_TYPE_LABELS[type]).toBeTruthy();
  });

  it("recognises known types only", () => {
    expect(isContentType("GAME_HIGHLIGHTS")).toBe(true);
    expect(isContentType("FAN_EDIT")).toBe(false);
  });
});

describe("sectionOf", () => {
  it("puts every kind of highlight on the highlights shelf", () => {
    expect(sectionOf({ contentType: "GAME_HIGHLIGHTS", gamePhase: null })).toBe("highlights");
    expect(sectionOf({ contentType: "PLAYER_HIGHLIGHTS", gamePhase: null })).toBe("highlights");
    expect(sectionOf({ contentType: "TOP_PLAYS", gamePhase: null })).toBe("highlights");
  });

  it("files media sessions by game phase", () => {
    expect(sectionOf({ contentType: "PREGAME_INTERVIEW", gamePhase: "pregame" })).toBe("pregame");
    expect(sectionOf({ contentType: "POSTGAME_INTERVIEW", gamePhase: "postgame" })).toBe("postgame");
    expect(sectionOf({ contentType: "COACH_PRESS_CONFERENCE", gamePhase: "postgame" })).toBe("postgame");
    expect(sectionOf({ contentType: "COACH_PRESS_CONFERENCE", gamePhase: "pregame" })).toBe("pregame");
  });

  it("files sessions with no stated phase under interviews", () => {
    expect(sectionOf({ contentType: "COACH_PRESS_CONFERENCE", gamePhase: null })).toBe("interviews");
    expect(sectionOf({ contentType: "MEDIA_AVAILABILITY", gamePhase: null })).toBe("interviews");
    expect(sectionOf({ contentType: "OFFICIAL_BASKETBALL_INTERVIEW", gamePhase: null })).toBe("interviews");
  });

  it("every section has a unique path", () => {
    expect(new Set(SECTIONS.map((section) => section.path)).size).toBe(SECTIONS.length);
  });
});
