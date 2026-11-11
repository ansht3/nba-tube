import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseOverrides } from "./overrides";

describe("parseOverrides", () => {
  it("accepts the committed overrides file", () => {
    expect(() => parseOverrides(JSON.parse(readFileSync("data/overrides.json", "utf8")))).not.toThrow();
  });

  it("accepts an inclusion with labels and an exclusion with a note", () => {
    const overrides = parseOverrides({
      schemaVersion: 1,
      include: [{ youtubeId: "aaaaaaaaaaa", contentType: "POSTGAME_INTERVIEW", gamePhase: "postgame", note: "Title omits the word postgame" }],
      exclude: [{ youtubeId: "bbbbbbbbbbb", note: "Sponsor segment titled as highlights" }],
    });
    expect(overrides.include).toHaveLength(1);
    expect(overrides.exclude).toHaveLength(1);
  });

  it("rejects a malformed id, an unknown content type or a missing note", () => {
    const base = { youtubeId: "aaaaaaaaaaa", contentType: "POSTGAME_INTERVIEW", gamePhase: "postgame", note: "why" };
    for (const entry of [{ ...base, youtubeId: "nope" }, { ...base, contentType: "FAN_EDIT" }, { ...base, note: "" }]) {
      expect(() => parseOverrides({ schemaVersion: 1, include: [entry], exclude: [] })).toThrow();
    }
  });

  it("rejects a video that is both included and excluded", () => {
    const overrides = {
      schemaVersion: 1,
      include: [{ youtubeId: "aaaaaaaaaaa", contentType: "TOP_PLAYS", gamePhase: null, note: "why" }],
      exclude: [{ youtubeId: "aaaaaaaaaaa", note: "why not" }],
    };
    expect(() => parseOverrides(overrides)).toThrow(/both included and excluded/);
  });
});
