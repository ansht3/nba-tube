import { describe, expect, it } from "vitest";
import type { Video } from "@/catalog/schema";
import { makeVideo, testId } from "@/test/fixtures";
import { NO_FILTERS, buildSearchIndex, filterVideos, filtersToQuery, hasActiveFilters, parseFilters, type BrowseFilters } from "./browse";

function video(name: string, overrides: Partial<Video>, labels: Partial<Video["labels"]> = {}): Video {
  return makeVideo({ youtubeId: testId(name), ...overrides, labels: { ...makeVideo().labels, ...labels } });
}

const HAWKS = "UCpfcwELvR1wtcRJ0UxNXHYw";
const NUGGETS = "UCl8hzdP5wVlhuzNG3WCJa1w";

// Newest first, as in the catalog.
const game = video("game", { title: "THUNDER at TRAIL BLAZERS | FULL GAME HIGHLIGHTS | November 10, 2026", durationSeconds: 588 }, { contentType: "GAME_HIGHLIGHTS", teamIds: ["OKC", "POR"] });
const jokic = video("jokic", { title: "Nikola Jokić 25 Points and 16 Rebounds | Game Highlights DEN vs. HOU", channelId: NUGGETS, channelTitle: "Denver Nuggets", durationSeconds: 150 }, { contentType: "PLAYER_HIGHLIGHTS", teamIds: ["DEN"] });
const presser = video("presser", { title: "Hawks vs. Lakers Postgame Press Conference: Head Coach Quin Snyder", channelId: HAWKS, channelTitle: "Atlanta Hawks", durationSeconds: 1500 }, { contentType: "COACH_PRESS_CONFERENCE", gamePhase: "postgame", teamIds: ["ATL"] });
const shootaround = video("shoot", { title: "Coby White Shootaround Media Availability | 11/2/26", durationSeconds: null }, { contentType: "PREGAME_INTERVIEW", gamePhase: "pregame", teamIds: ["CHA"] });

const index = buildSearchIndex([game, jokic, presser, shootaround]);
const NOW = Date.parse("2026-11-12T12:00:00Z");
const find = (filters: Partial<BrowseFilters>) => filterVideos(index, { ...NO_FILTERS, ...filters }, NOW);

describe("filterVideos", () => {
  it("returns everything, newest first, when no filter is set", () => {
    expect(find({})).toEqual([game, jokic, presser, shootaround]);
  });

  it("searches titles without caring about case or word order", () => {
    expect(find({ query: "blazers thunder" })).toEqual([game]);
    expect(find({ query: "PRESS conference" })).toEqual([presser]);
  });

  it("requires every word of the search to match", () => {
    expect(find({ query: "thunder lakers" })).toEqual([]);
  });

  it("finds accented names typed without accents", () => {
    expect(find({ query: "jokic" })).toEqual([jokic]);
    expect(find({ query: "Jokić" })).toEqual([jokic]);
  });

  it("searches channel names, team names, team codes and content labels", () => {
    expect(find({ query: "atlanta" })).toEqual([presser]);
    expect(find({ query: "oklahoma city" })).toEqual([game]);
    expect(find({ query: "POR" })).toEqual([game]);
    expect(find({ query: "player highlights" })).toEqual([jokic]);
  });

  it("filters by section, content type, team and source", () => {
    expect(find({ section: "highlights" })).toEqual([game, jokic]);
    expect(find({ section: "postgame" })).toEqual([presser]);
    expect(find({ type: "PREGAME_INTERVIEW" })).toEqual([shootaround]);
    expect(find({ team: "DEN" })).toEqual([jokic]);
    expect(find({ source: HAWKS })).toEqual([presser]);
  });

  it("filters by duration and leaves out videos of unknown length", () => {
    expect(find({ duration: "short" })).toEqual([jokic]);
    expect(find({ duration: "medium" })).toEqual([game]);
    expect(find({ duration: "long" })).toEqual([presser]);
  });

  it("combines filters", () => {
    expect(find({ section: "highlights", query: "denver" })).toEqual([jokic]);
    expect(find({ section: "highlights", team: "ATL" })).toEqual([]);
  });

  it("sorts oldest first on request without disturbing the index", () => {
    expect(find({ sort: "oldest" })).toEqual([shootaround, presser, jokic, game]);
    expect(find({})).toEqual([game, jokic, presser, shootaround]);
  });

  it("returns nothing from an empty catalog", () => {
    expect(filterVideos(buildSearchIndex([]), { ...NO_FILTERS, query: "anything" })).toEqual([]);
  });
});

describe("upload date and order", () => {
  // The fixture videos are all published 2026-11-11T17:00:01Z.
  it("keeps only videos inside the upload window", () => {
    expect(find({ date: "day" })).toHaveLength(4);
    expect(filterVideos(index, { ...NO_FILTERS, date: "day" }, NOW + 3 * 86_400_000)).toEqual([]);
    expect(filterVideos(index, { ...NO_FILTERS, date: "week" }, NOW + 3 * 86_400_000)).toHaveLength(4);
  });

  it("sorts best first by kind of video when ages are equal", () => {
    expect(find({ sort: "best" })).toEqual([game, jokic, presser, shootaround]);
  });

  it("reads the old 'newest' sort as the default order", () => {
    expect(parseFilters(new URLSearchParams("sort=newest")).sort).toBe("latest");
  });
});

describe("filters in the URL", () => {
  it("round-trips through a query string", () => {
    const filters: BrowseFilters = { query: "curry", section: "postgame", type: "COACH_PRESS_CONFERENCE", team: "GSW", source: HAWKS, duration: "long", date: "week", sort: "best" };
    expect(parseFilters(new URLSearchParams(filtersToQuery(filters)))).toEqual(filters);
  });

  it("writes nothing for the defaults", () => {
    expect(filtersToQuery(NO_FILTERS)).toBe("");
    expect(parseFilters(new URLSearchParams(""))).toEqual(NO_FILTERS);
  });

  it("ignores unknown or malformed values instead of failing", () => {
    const params = new URLSearchParams("section=nope&type=FAN_EDIT&team=sea&source=<script>&duration=forever&date=decade&sort=random&q=%20%20curry%20");
    expect(parseFilters(params)).toEqual({ ...NO_FILTERS, query: "curry" });
  });

  it("accepts a lower-case team code and caps the query length", () => {
    expect(parseFilters(new URLSearchParams("team=lal")).team).toBe("LAL");
    expect(parseFilters(new URLSearchParams(`q=${"a".repeat(500)}`)).query).toHaveLength(100);
  });

  it("does not count the sort order as an active filter", () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, sort: "oldest" })).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, date: "day" })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, team: "LAL" })).toBe(true);
    expect(hasActiveFilters({ ...NO_FILTERS, query: "x" })).toBe(true);
  });
});
