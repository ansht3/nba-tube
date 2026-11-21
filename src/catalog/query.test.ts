import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parseVideoQuery } from "./query";
import { decodeCursor, InvalidCursorError } from "./repository";
import { searchWords } from "./search";

const NOW = Date.parse("2026-11-16T12:00:30Z");
const parse = (search: string) => parseVideoQuery(new URLSearchParams(search), NOW);
const ok = (search: string) => {
  const result = parse(search);
  if (!result.ok) throw new Error(`expected valid, got: ${result.error}`);
  return result;
};
const error = (search: string) => {
  const result = parse(search);
  if (result.ok) throw new Error("expected an error");
  return result.error;
};

describe("parseVideoQuery", () => {
  it("defaults to the newest 24", () => {
    expect(ok("").query).toEqual({ limit: DEFAULT_PAGE_SIZE });
  });

  it("reads every filter", () => {
    const { query } = ok("section=highlights&team=lal&type=GAME_HIGHLIGHTS,TOP_PLAYS&channel=UCWJ2lWNubArHWmf3FIHbfcQ&q=%20lakers%20%20jokic%20&duration=medium&sort=oldest&limit=10&cursor=abc");
    expect(query).toMatchObject({
      section: "highlights",
      teamId: "LAL",
      contentTypes: ["GAME_HIGHLIGHTS", "TOP_PLAYS"],
      channelId: "UCWJ2lWNubArHWmf3FIHbfcQ",
      q: "lakers jokic",
      duration: { min: 300, max: 1200 },
      sort: "oldest",
      limit: 10,
      cursor: "abc",
    });
  });

  it("turns an upload window into a cutoff rounded to the minute, and says the answer depends on time", () => {
    const result = ok("date=day");
    expect(result.query.publishedAfterMs).toBe(Date.parse("2026-11-15T12:00:00Z"));
    expect(result.timeSensitive).toBe(true);
    expect(ok("sort=latest").timeSensitive).toBe(false);
  });

  it("rejects unknown parameters, so the CDN cannot be given unlimited cache keys", () => {
    expect(error("page=2")).toMatch(/Unknown parameter "page"/);
    expect(error("limit=5&utm_source=x")).toMatch(/utm_source/);
  });

  it("rejects a parameter given twice", () => {
    expect(error("team=LAL&team=BOS")).toMatch(/only be given once/);
  });

  it("rejects values it does not recognise", () => {
    expect(error("section=news")).toMatch(/section/);
    expect(error("team=XXX")).toMatch(/team/);
    expect(error("type=GAME_HIGHLIGHTS,NOPE")).toMatch(/NOPE/);
    expect(error("channel=notachannel")).toMatch(/channel/);
    expect(error("date=year")).toMatch(/date/);
    expect(error("duration=forever")).toMatch(/duration/);
    expect(error("sort=popular")).toMatch(/sort/);
  });

  it("reads best-first order and a list of ids, and bounds that list", () => {
    expect(ok("sort=best").query.sort).toBe("best");
    expect(ok("ids=aaaaaaaaaaa,bbbbbbbbbbb,aaaaaaaaaaa").query.ids).toEqual(["aaaaaaaaaaa", "bbbbbbbbbbb"]);
    expect(error("ids=short")).toMatch(/not a YouTube video id/);
    expect(error(`ids=${Array.from({ length: 49 }, (_, i) => `v${String(i).padStart(10, "0")}`).join(",")}`)).toMatch(/at most 48/);
  });

  it("reads a list of teams (any of them) and rejects an unknown one", () => {
    expect(ok("teams=lal,BOS,lal").query.anyTeamIds).toEqual(["LAL", "BOS"]);
    expect(error("teams=LAL,XXX")).toMatch(/Unknown team "XXX"/);
  });

  it("bounds the page size to whole numbers from 1 to 48", () => {
    expect(ok(`limit=${MAX_PAGE_SIZE}`).query.limit).toBe(MAX_PAGE_SIZE);
    for (const bad of ["0", "49", "-1", "2.5", "ten", "1e2", ""]) expect(error(`limit=${bad}`), bad).toMatch(/limit/);
  });

  it("bounds the search text and the cursor", () => {
    expect(error(`q=${"a".repeat(81)}`)).toMatch(/q/);
    expect(error(`cursor=${"a".repeat(121)}`)).toMatch(/cursor/);
  });

  it("gives the same cache key whatever order the parameters arrive in", () => {
    expect(ok("team=LAL&section=highlights").cacheKey).toBe(ok("section=highlights&team=LAL").cacheKey);
    expect(ok("team=LAL").cacheKey).not.toBe(ok("team=BOS").cacheKey);
  });

  it("gives one cache key to requests that mean the same thing", () => {
    expect(ok("team=lal").cacheKey).toBe(ok("team=LAL").cacheKey);
    expect(ok("teams=LAL,BOS").cacheKey).toBe(ok("teams=BOS,LAL,LAL").cacheKey);
    expect(ok("type=GAME_HIGHLIGHTS,TOP_PLAYS").cacheKey).toBe(ok("type=TOP_PLAYS,GAME_HIGHLIGHTS").cacheKey);
    expect(ok("sort=latest").cacheKey).toBe(ok("").cacheKey);
    expect(ok(`limit=${DEFAULT_PAGE_SIZE}`).cacheKey).toBe(ok("").cacheKey);
    expect(ok("q=Lakers  Celtics").cacheKey).toBe(ok("q=celtics lakers").cacheKey);
  });

  it("still tells different requests apart", () => {
    expect(ok("sort=oldest").cacheKey).not.toBe(ok("").cacheKey);
    expect(ok("limit=12").cacheKey).not.toBe(ok("").cacheKey);
    expect(ok("q=lakers").cacheKey).not.toBe(ok("q=celtics").cacheKey);
    expect(ok("date=day").cacheKey).not.toBe(ok("date=week").cacheKey);
    expect(ok("duration=short").cacheKey).not.toBe(ok("duration=long").cacheKey);
  });

  it("ignores search words beyond the eighth, so a request cannot force unlimited scans", () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`);
    expect(ok(`q=${words.slice(0, 8).join(" ")}`).cacheKey).toBe(ok(`q=${words.slice(0, 8).join(" ")} extra`).cacheKey);
    expect(searchWords(words.join(" "))).toHaveLength(8);
  });
});

describe("cursor bounds", () => {
  const cursor = (text: string) => Buffer.from(text).toString("base64url");
  const rejected = (text: string, sort: "latest" | "oldest" | "best" = "latest") => expect(() => decodeCursor(cursor(text), sort)).toThrow(InvalidCursorError);

  it("accepts the cursors this API issues", () => {
    expect(decodeCursor(cursor("l~1700000000000~AAAAAAAAAAA"), "latest")).toMatchObject({ publishedMs: 1_700_000_000_000 });
    expect(decodeCursor(cursor("b~12345.5~1700000000000~AAAAAAAAAAA"), "best")).toMatchObject({ bestKey: 12345.5 });
  });

  it("rejects times that no video can have, so the database is never asked to read them", () => {
    rejected("l~-9007199254740991~AAAAAAAAAAA");
    rejected("l~-1~AAAAAAAAAAA");
    rejected("o~9007199254740991~AAAAAAAAAAA", "oldest");
    rejected("l~4102444800001~AAAAAAAAAAA");
  });

  it("rejects an out-of-range or non-finite best key", () => {
    rejected("b~1e308~1700000000000~AAAAAAAAAAA", "best");
    rejected("b~-1e9~1700000000000~AAAAAAAAAAA", "best");
    rejected("b~Infinity~1700000000000~AAAAAAAAAAA", "best");
    rejected("b~NaN~1700000000000~AAAAAAAAAAA", "best");
  });
});
