export type Conference = "East" | "West";

export interface Team {
  /** The league's three-letter code, used as the stable id everywhere. */
  id: string;
  city: string;
  name: string;
  conference: Conference;
  /**
   * How the league channel writes the team in matchup titles
   * ("TRAIL BLAZERS at 76ERS"). Compared case-insensitively.
   */
  matchupNames: string[];
}

export const TEAMS: Team[] = [
  { id: "ATL", city: "Atlanta", name: "Hawks", conference: "East", matchupNames: ["Hawks"] },
  { id: "BOS", city: "Boston", name: "Celtics", conference: "East", matchupNames: ["Celtics"] },
  { id: "BKN", city: "Brooklyn", name: "Nets", conference: "East", matchupNames: ["Nets"] },
  { id: "CHA", city: "Charlotte", name: "Hornets", conference: "East", matchupNames: ["Hornets"] },
  { id: "CHI", city: "Chicago", name: "Bulls", conference: "East", matchupNames: ["Bulls"] },
  { id: "CLE", city: "Cleveland", name: "Cavaliers", conference: "East", matchupNames: ["Cavaliers", "Cavs"] },
  { id: "DAL", city: "Dallas", name: "Mavericks", conference: "West", matchupNames: ["Mavericks", "Mavs"] },
  { id: "DEN", city: "Denver", name: "Nuggets", conference: "West", matchupNames: ["Nuggets"] },
  { id: "DET", city: "Detroit", name: "Pistons", conference: "East", matchupNames: ["Pistons"] },
  { id: "GSW", city: "Golden State", name: "Warriors", conference: "West", matchupNames: ["Warriors"] },
  { id: "HOU", city: "Houston", name: "Rockets", conference: "West", matchupNames: ["Rockets"] },
  { id: "IND", city: "Indiana", name: "Pacers", conference: "East", matchupNames: ["Pacers"] },
  { id: "LAC", city: "LA", name: "Clippers", conference: "West", matchupNames: ["Clippers"] },
  { id: "LAL", city: "Los Angeles", name: "Lakers", conference: "West", matchupNames: ["Lakers"] },
  { id: "MEM", city: "Memphis", name: "Grizzlies", conference: "West", matchupNames: ["Grizzlies"] },
  { id: "MIA", city: "Miami", name: "Heat", conference: "East", matchupNames: ["Heat"] },
  { id: "MIL", city: "Milwaukee", name: "Bucks", conference: "East", matchupNames: ["Bucks"] },
  { id: "MIN", city: "Minnesota", name: "Timberwolves", conference: "West", matchupNames: ["Timberwolves", "Wolves"] },
  { id: "NOP", city: "New Orleans", name: "Pelicans", conference: "West", matchupNames: ["Pelicans"] },
  { id: "NYK", city: "New York", name: "Knicks", conference: "East", matchupNames: ["Knicks"] },
  { id: "OKC", city: "Oklahoma City", name: "Thunder", conference: "West", matchupNames: ["Thunder"] },
  { id: "ORL", city: "Orlando", name: "Magic", conference: "East", matchupNames: ["Magic"] },
  { id: "PHI", city: "Philadelphia", name: "76ers", conference: "East", matchupNames: ["76ers", "Sixers"] },
  { id: "PHX", city: "Phoenix", name: "Suns", conference: "West", matchupNames: ["Suns"] },
  { id: "POR", city: "Portland", name: "Trail Blazers", conference: "West", matchupNames: ["Trail Blazers", "Blazers"] },
  { id: "SAC", city: "Sacramento", name: "Kings", conference: "West", matchupNames: ["Kings"] },
  { id: "SAS", city: "San Antonio", name: "Spurs", conference: "West", matchupNames: ["Spurs"] },
  { id: "TOR", city: "Toronto", name: "Raptors", conference: "East", matchupNames: ["Raptors"] },
  { id: "UTA", city: "Utah", name: "Jazz", conference: "West", matchupNames: ["Jazz"] },
  { id: "WAS", city: "Washington", name: "Wizards", conference: "East", matchupNames: ["Wizards"] },
];

export const TEAM_IDS = TEAMS.map((team) => team.id);

const teamsById = new Map(TEAMS.map((team) => [team.id, team]));

export function getTeam(id: string): Team | undefined {
  return teamsById.get(id);
}

export function teamFullName(team: Team): string {
  return `${team.city} ${team.name}`;
}

const teamsByMatchupName = new Map<string, Team>();
for (const team of TEAMS) {
  for (const name of team.matchupNames) {
    teamsByMatchupName.set(name.toLowerCase(), team);
  }
}

/** Exact match only: "Trail Blazers" finds Portland, "Blazers fans" finds nothing. */
export function findTeamByMatchupName(name: string): Team | undefined {
  return teamsByMatchupName.get(name.trim().toLowerCase());
}
