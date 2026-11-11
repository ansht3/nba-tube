import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { approvedSources, parseSourceRegistry } from "./sources";
import { TEAM_IDS } from "./teams";

const registryFile = JSON.parse(readFileSync("data/sources.json", "utf8"));

function sourceEntry(overrides: Record<string, unknown> = {}) {
  return {
    channelId: "UCWJ2lWNubArHWmf3FIHbfcQ",
    name: "NBA",
    handle: "@NBA",
    publisherType: "league",
    status: "approved",
    teamId: null,
    allowedContentTypes: ["GAME_HIGHLIGHTS"],
    verification: {
      method: "youtube-badge-and-activity",
      evidence: "https://www.youtube.com/@NBA",
      verifiedAt: "2026-11-11",
    },
    ...overrides,
  };
}

describe("data/sources.json", () => {
  const registry = parseSourceRegistry(registryFile);

  it("is valid and covers the league and all 30 teams exactly once", () => {
    const approved = approvedSources(registry);
    expect(approved.filter((source) => source.publisherType === "league")).toHaveLength(1);
    const teamIds = approved.filter((source) => source.publisherType === "team").map((source) => source.teamId);
    expect([...teamIds].sort()).toEqual([...TEAM_IDS].sort());
  });

  it("records how every channel was verified", () => {
    for (const source of registry.sources) {
      expect(source.verification.evidence).toMatch(/^https:\/\//);
      expect(source.verification.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("parseSourceRegistry", () => {
  it("rejects a channel listed twice", () => {
    const registry = { schemaVersion: 1, sources: [sourceEntry(), sourceEntry()] };
    expect(() => parseSourceRegistry(registry)).toThrow(/duplicate channel/);
  });

  it("rejects a malformed channel id", () => {
    const registry = { schemaVersion: 1, sources: [sourceEntry({ channelId: "@NBA" })] };
    expect(() => parseSourceRegistry(registry)).toThrow();
  });

  it("requires a team for team channels and forbids one for the league", () => {
    const teamWithoutTeam = { schemaVersion: 1, sources: [sourceEntry({ publisherType: "team" })] };
    expect(() => parseSourceRegistry(teamWithoutTeam)).toThrow(/needs a teamId/);
    const leagueWithTeam = { schemaVersion: 1, sources: [sourceEntry({ teamId: "LAL" })] };
    expect(() => parseSourceRegistry(leagueWithTeam)).toThrow(/must not have a teamId/);
  });

  it("rejects an unknown team, content type or verification method", () => {
    const cases = [
      sourceEntry({ publisherType: "team", teamId: "SEA" }),
      sourceEntry({ allowedContentTypes: ["FAN_EDIT"] }),
      sourceEntry({ allowedContentTypes: [] }),
      sourceEntry({ verification: { method: "trust-me", evidence: "https://example.com", verifiedAt: "2026-11-11" } }),
    ];
    for (const entry of cases) {
      expect(() => parseSourceRegistry({ schemaVersion: 1, sources: [entry] })).toThrow();
    }
  });

  it("only approved channels are ingested", () => {
    const registry = parseSourceRegistry({
      schemaVersion: 1,
      sources: [sourceEntry(), sourceEntry({ channelId: "UCeYc_OjHs3QNxIjti2whKzg", status: "candidate" })],
    });
    expect(approvedSources(registry).map((source) => source.channelId)).toEqual(["UCWJ2lWNubArHWmf3FIHbfcQ"]);
  });
});
