import { describe, expect, it } from "vitest";
import { TEAMS, findTeamByMatchupName, getTeam, teamFullName } from "./teams";

describe("teams", () => {
  it("lists all 30 teams with unique ids, 15 per conference", () => {
    expect(TEAMS).toHaveLength(30);
    expect(new Set(TEAMS.map((team) => team.id)).size).toBe(30);
    expect(TEAMS.filter((team) => team.conference === "East")).toHaveLength(15);
    expect(TEAMS.filter((team) => team.conference === "West")).toHaveLength(15);
  });

  it("finds a team by the name the league channel uses in matchup titles", () => {
    expect(findTeamByMatchupName("TRAIL BLAZERS")?.id).toBe("POR");
    expect(findTeamByMatchupName("76ERS")?.id).toBe("PHI");
    expect(findTeamByMatchupName(" thunder ")?.id).toBe("OKC");
  });

  it("does not guess from partial or unknown names", () => {
    expect(findTeamByMatchupName("Blazers fans")).toBeUndefined();
    expect(findTeamByMatchupName("SuperSonics")).toBeUndefined();
    expect(findTeamByMatchupName("")).toBeUndefined();
  });

  it("no matchup name points at two teams", () => {
    const names = TEAMS.flatMap((team) => team.matchupNames.map((name) => name.toLowerCase()));
    expect(new Set(names).size).toBe(names.length);
  });

  it("formats full names", () => {
    expect(teamFullName(getTeam("LAC")!)).toBe("LA Clippers");
    expect(getTeam("XXX")).toBeUndefined();
  });
});
