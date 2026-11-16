import { describe, expect, it } from "vitest";
import { makeVideo, testId } from "@/test/fixtures";
import type { ContentType } from "./content-types";
import { FileCatalogRepository } from "./file-repository";
import { InvalidCursorError, compareVideos, decodeCursor, encodeCursor } from "./repository";
import type { Catalog, Video } from "./schema";
import { relatedVideos } from "./select";

function video(name: string, publishedAt: string, extra: { type?: ContentType; teams?: string[]; channelId?: string; channelTitle?: string } = {}): Video {
  const base = makeVideo();
  return makeVideo({
    youtubeId: testId(name),
    publishedAt,
    channelId: extra.channelId ?? base.channelId,
    channelTitle: extra.channelTitle ?? base.channelTitle,
    labels: { ...base.labels, contentType: extra.type ?? "TOP_PLAYS", teamIds: extra.teams ?? [] },
  });
}

const catalogOf = (videos: Video[], generatedAt = "2026-11-16T10:00:00.000Z"): Catalog => ({ schemaVersion: 1, mode: "feed", generatedAt, videos });
const repoOf = (videos: Video[]) => new FileCatalogRepository(() => catalogOf(videos));
const ids = (videos: Video[]) => videos.map((v) => v.youtubeId);

const SAMPLE = [
  video("a", "2026-11-16T09:00:00.000Z", { type: "GAME_HIGHLIGHTS", teams: ["LAL", "BOS"] }),
  video("b", "2026-11-16T08:00:00.000Z", { type: "POSTGAME_INTERVIEW", teams: ["LAL"] }),
  video("c", "2026-11-16T07:00:00.000Z", { type: "PLAYER_HIGHLIGHTS", teams: ["BOS"], channelId: "UC" + "x".repeat(22), channelTitle: "Celtics" }),
  video("d", "2026-11-15T07:00:00.000Z", { type: "PREGAME_INTERVIEW", teams: ["LAL"] }),
];

describe("ordering", () => {
  it("is newest first even when offsets are written differently", async () => {
    const mixed = [video("old", "2026-11-16T08:00:00+00:00"), video("new", "2026-11-16T08:00:01.000Z"), video("mid", "2026-11-16T08:00:00.500Z")];
    expect(ids((await repoOf(mixed).list({ limit: 10 })).videos)).toEqual([testId("new"), testId("mid"), testId("old")]);
  });

  it("breaks ties by YouTube id so the order is stable", async () => {
    const tied = [video("zz", "2026-11-16T08:00:00.000Z"), video("aa", "2026-11-16T08:00:00.000Z"), video("mm", "2026-11-16T08:00:00.000Z")];
    expect(ids((await repoOf(tied).list({ limit: 10 })).videos)).toEqual([testId("aa"), testId("mm"), testId("zz")]);
  });
});

describe("filters", () => {
  const repo = repoOf(SAMPLE);
  it("filters by section, team, content types and channel, and reports the total", async () => {
    expect(ids((await repo.list({ limit: 10, section: "highlights" })).videos)).toEqual([testId("a"), testId("c")]);
    expect(ids((await repo.list({ limit: 10, teamId: "LAL" })).videos)).toEqual([testId("a"), testId("b"), testId("d")]);
    expect(ids((await repo.list({ limit: 10, contentTypes: ["PREGAME_INTERVIEW", "POSTGAME_INTERVIEW"] })).videos)).toEqual([testId("b"), testId("d")]);
    expect(ids((await repo.list({ limit: 10, channelId: "UC" + "x".repeat(22) })).videos)).toEqual([testId("c")]);
    expect((await repo.list({ limit: 1, teamId: "LAL" })).total).toBe(3);
  });

  it("combines filters and counts without paging", async () => {
    expect(await repo.count({ teamId: "BOS", section: "highlights" })).toBe(2);
    expect(await repo.count({ teamId: "BOS", section: "postgame" })).toBe(0);
  });
});

describe("cursor pagination", () => {
  const many = Array.from({ length: 11 }, (_, i) => video(`v${String(i).padStart(2, "0")}`, `2026-11-16T${String(20 - i).padStart(2, "0")}:00:00.000Z`));

  it("walks every video exactly once, with a constant total", async () => {
    const repo = repoOf(many);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await repo.list({ limit: 4, cursor });
      expect(page.total).toBe(11);
      seen.push(...ids(page.videos));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(ids(many));
  });

  it("has no next cursor when the last page is exactly full", async () => {
    const page = await repoOf(many.slice(0, 4)).list({ limit: 4 });
    expect(page.videos).toHaveLength(4);
    expect(page.nextCursor).toBeNull();
  });

  it("neither repeats nor skips videos when newer ones are published between pages", async () => {
    let current = many;
    const repo = new FileCatalogRepository(() => catalogOf(current, String(current.length)));
    const first = await repo.list({ limit: 4 });
    current = [video("new1", "2026-11-17T01:00:00.000Z"), video("new2", "2026-11-17T02:00:00.000Z"), ...many];
    const second = await repo.list({ limit: 4, cursor: first.nextCursor });
    expect(ids(second.videos)).toEqual(ids(many.slice(4, 8)));
  });

  it("rejects cursors that were not issued by this API", async () => {
    const repo = repoOf(many);
    // An empty cursor means "no cursor" (a blank query parameter), so it is not in this list.
    for (const bad of ["not base64 !!", btoa("abc"), btoa("123.short"), btoa("x.AAAAAAAAAAA"), btoa("1.2.AAAAAAAAAAA")]) {
      await expect(repo.list({ limit: 4, cursor: bad }), bad).rejects.toBeInstanceOf(InvalidCursorError);
    }
  });

  it("round-trips a cursor", () => {
    const v = video("rt", "2026-11-16T08:00:00+00:00");
    expect(decodeCursor(encodeCursor(v))).toEqual({ publishedMs: Date.parse("2026-11-16T08:00:00Z"), youtubeId: testId("rt") });
  });
});

describe("single reads", () => {
  const repo = repoOf(SAMPLE);
  it("describes the catalog", async () => {
    expect(await repo.meta()).toEqual({ version: "2026-11-16T10:00:00.000Z", generatedAt: "2026-11-16T10:00:00.000Z", mode: "feed", total: 4, newestPublishedAt: "2026-11-16T09:00:00.000Z" });
    expect((await repoOf([]).meta()).newestPublishedAt).toBeNull();
  });
  it("gets a video by id or null", async () => {
    expect((await repo.get(testId("c")))?.youtubeId).toBe(testId("c"));
    expect(await repo.get("missing____")).toBeNull();
  });
  it("lists related videos exactly as the selector does over the sorted catalog, never including the video itself", async () => {
    const related = await repo.related(SAMPLE[1]!, 10);
    expect(ids(related)).toEqual(ids(relatedVideos(SAMPLE[1]!, [...SAMPLE].sort(compareVideos), 10)));
    expect(ids(related)).not.toContain(testId("b"));
    expect(related.length).toBeGreaterThan(0);
  });
  it("counts videos per team, summarises channels by their newest title, and lists all ids", async () => {
    expect([...(await repo.countsByTeam())]).toEqual([["LAL", 3], ["BOS", 2]]);
    expect((await repo.channels()).find((c) => c.channelTitle === "Celtics")?.count).toBe(1);
    expect(await repo.allIds()).toEqual(ids(SAMPLE));
  });
});
