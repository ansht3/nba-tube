import { describe, expect, it } from "vitest";
import { makeVideo, testId } from "@/test/fixtures";
import type { ContentType } from "./content-types";
import { InvalidCursorError, compareVideos, decodeCursor, encodeCursor, type CatalogRepository } from "./repository";
import type { Video } from "./schema";
import { relatedVideos } from "./select";
import { sortBestFirst } from "./rank";

/**
 * What every CatalogRepository must do, whatever it is backed by. The same
 * tests run against the in-memory implementation and against Postgres, so the
 * database version cannot drift from the behaviour the site was built on.
 */
export interface Harness {
  repo: CatalogRepository;
  /** Adds videos after the harness was created, as ingestion would. */
  add(videos: Video[]): Promise<void>;
}

export interface VideoOptions {
  type?: ContentType;
  teams?: string[];
  channelId?: string;
  channelTitle?: string;
  title?: string;
  durationSeconds?: number | null;
}

export function video(name: string, publishedAt: string, extra: VideoOptions = {}): Video {
  const base = makeVideo();
  return makeVideo({
    youtubeId: testId(name),
    publishedAt,
    title: extra.title ?? `Title of ${name}`,
    channelId: extra.channelId ?? base.channelId,
    channelTitle: extra.channelTitle ?? base.channelTitle,
    durationSeconds: extra.durationSeconds ?? null,
    labels: { ...base.labels, contentType: extra.type ?? "TOP_PLAYS", teamIds: extra.teams ?? [] },
  });
}

const ids = (videos: Video[]) => videos.map((v) => v.youtubeId);
const CELTICS_CHANNEL = "UC" + "x".repeat(22);

export function describeRepositoryContract(name: string, create: (videos: Video[]) => Promise<Harness>) {
  const SAMPLE = [
    video("a", "2026-11-16T09:00:00.000Z", { type: "GAME_HIGHLIGHTS", teams: ["LAL", "BOS"], title: "Lakers at Celtics | FULL GAME HIGHLIGHTS", durationSeconds: 600 }),
    video("b", "2026-11-16T08:00:00.000Z", { type: "POSTGAME_INTERVIEW", teams: ["LAL"], title: "Nikola Jokić postgame", durationSeconds: 120 }),
    video("c", "2026-11-16T07:00:00.000Z", { type: "PLAYER_HIGHLIGHTS", teams: ["BOS"], channelId: CELTICS_CHANNEL, channelTitle: "Celtics", durationSeconds: 1500 }),
    video("d", "2026-11-15T07:00:00.000Z", { type: "PREGAME_INTERVIEW", teams: ["LAL"] }),
  ];

  describe(`${name}: ordering`, () => {
    it("is newest first even when offsets are written differently", async () => {
      const { repo } = await create([video("old", "2026-11-16T08:00:00+00:00"), video("new", "2026-11-16T08:00:01.000Z"), video("mid", "2026-11-16T08:00:00.500Z")]);
      expect(ids((await repo.list({ limit: 10 })).videos)).toEqual([testId("new"), testId("mid"), testId("old")]);
    });

    it("breaks ties by YouTube id in byte order so the order is stable", async () => {
      const { repo } = await create([video("zz", "2026-11-16T08:00:00.000Z"), video("aa", "2026-11-16T08:00:00.000Z"), video("QQ", "2026-11-16T08:00:00.000Z"), video("mm", "2026-11-16T08:00:00.000Z")]);
      expect(ids((await repo.list({ limit: 10 })).videos)).toEqual([testId("QQ"), testId("aa"), testId("mm"), testId("zz")]);
    });

    it("sorts oldest first as the exact reverse, ties included", async () => {
      const videos = [video("zz", "2026-11-16T08:00:00.000Z"), video("aa", "2026-11-16T08:00:00.000Z"), video("old", "2026-11-14T08:00:00.000Z")];
      const { repo } = await create(videos);
      const newest = ids((await repo.list({ limit: 10 })).videos);
      expect(ids((await repo.list({ limit: 10, sort: "oldest" })).videos)).toEqual([...newest].reverse());
    });
  });

  describe(`${name}: filters`, () => {
    it("filters by section, team, content types and channel, and reports the total", async () => {
      const { repo } = await create(SAMPLE);
      expect(ids((await repo.list({ limit: 10, section: "highlights" })).videos)).toEqual([testId("a"), testId("c")]);
      expect(ids((await repo.list({ limit: 10, teamId: "LAL" })).videos)).toEqual([testId("a"), testId("b"), testId("d")]);
      expect(ids((await repo.list({ limit: 10, contentTypes: ["PREGAME_INTERVIEW", "POSTGAME_INTERVIEW"] })).videos)).toEqual([testId("b"), testId("d")]);
      expect(ids((await repo.list({ limit: 10, channelId: CELTICS_CHANNEL })).videos)).toEqual([testId("c")]);
      expect((await repo.list({ limit: 1, teamId: "LAL" })).total).toBe(3);
    });

    it("finds videos about any of several teams", async () => {
      const { repo } = await create(SAMPLE);
      expect(ids((await repo.list({ limit: 10, anyTeamIds: ["BOS"] })).videos)).toEqual([testId("a"), testId("c")]);
      expect(ids((await repo.list({ limit: 10, anyTeamIds: ["BOS", "LAL"] })).videos)).toEqual([testId("a"), testId("b"), testId("c"), testId("d")]);
      expect(await repo.count({ anyTeamIds: ["NYK"] })).toBe(0);
    });

    it("combines filters and counts without paging", async () => {
      const { repo } = await create(SAMPLE);
      expect(await repo.count({ teamId: "BOS", section: "highlights" })).toBe(2);
      expect(await repo.count({ teamId: "BOS", section: "postgame" })).toBe(0);
      expect(await repo.count({})).toBe(4);
    });

    it("searches every word in any order, ignoring case and accents, across title, channel, type and team names", async () => {
      const { repo } = await create(SAMPLE);
      expect(ids((await repo.list({ limit: 10, q: "jokic" })).videos)).toEqual([testId("b")]);
      expect(ids((await repo.list({ limit: 10, q: "POSTGAME  nikola" })).videos)).toEqual([testId("b")]);
      expect(ids((await repo.list({ limit: 10, q: "celtics" })).videos)).toEqual([testId("a"), testId("c")]);
      expect(ids((await repo.list({ limit: 10, q: "lakers" })).videos)).toEqual([testId("a"), testId("b"), testId("d")]);
      expect(ids((await repo.list({ limit: 10, q: "lakers jokic" })).videos)).toEqual([testId("b")]);
      expect((await repo.list({ limit: 10, q: "no such words" })).total).toBe(0);
      expect(await repo.count({ q: "lakers" })).toBe(3);
    });

    it("treats % and _ in a search as plain characters", async () => {
      const { repo } = await create([video("p", "2026-11-16T09:00:00.000Z", { title: "100% effort_night" }), video("q", "2026-11-16T08:00:00.000Z", { title: "plain title" })]);
      expect(ids((await repo.list({ limit: 10, q: "100%" })).videos)).toEqual([testId("p")]);
      expect(ids((await repo.list({ limit: 10, q: "%" })).videos)).toEqual([testId("p")]);
      // "fo_t" would match "fort" if _ were a wildcard; literally it is not in the text.
      expect(ids((await repo.list({ limit: 10, q: "fo_t" })).videos)).toEqual([]);
      expect(ids((await repo.list({ limit: 10, q: "t_n" })).videos)).toEqual([testId("p")]);
    });

    it("filters by upload window", async () => {
      const { repo } = await create(SAMPLE);
      expect(ids((await repo.list({ limit: 10, publishedAfterMs: Date.parse("2026-11-16T07:30:00Z") })).videos)).toEqual([testId("a"), testId("b")]);
      expect(ids((await repo.list({ limit: 10, publishedAfterMs: Date.parse("2026-11-16T09:00:00Z") })).videos)).toEqual([testId("a")]);
    });

    it("filters by duration, never matching videos with no known duration", async () => {
      const { repo } = await create(SAMPLE);
      expect(ids((await repo.list({ limit: 10, duration: { min: 0, max: 300 } })).videos)).toEqual([testId("b")]);
      expect(ids((await repo.list({ limit: 10, duration: { min: 300, max: 1200 } })).videos)).toEqual([testId("a")]);
      expect(ids((await repo.list({ limit: 10, duration: { min: 1200, max: null } })).videos)).toEqual([testId("c")]);
      expect(await repo.count({ duration: { min: 0, max: null } })).toBe(3);
    });
  });

  describe(`${name}: cursor pagination`, () => {
    it("refuses a forged cursor the same way, whatever the storage: it is a client error, not an outage", async () => {
      const { repo } = await create([video("a", "2026-11-10T00:00:00Z")]);
      const forged = Buffer.from("l~-9007199254740991~AAAAAAAAAAA").toString("base64url");
      await expect(repo.list({ limit: 4, cursor: forged })).rejects.toThrow(InvalidCursorError);
    });

    const many = Array.from({ length: 11 }, (_, i) => video(`v${String(i).padStart(2, "0")}`, `2026-11-16T${String(20 - i).padStart(2, "0")}:00:00.000Z`));

    it("walks every video exactly once, with a constant total", async () => {
      const { repo } = await create(many);
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

    it("walks the oldest-first order the same way", async () => {
      const { repo } = await create(many);
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await repo.list({ limit: 5, sort: "oldest", cursor });
        seen.push(...ids(page.videos));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toEqual(ids(many).reverse());
    });

    it("paginates a filtered search", async () => {
      const { repo } = await create(many);
      const first = await repo.list({ limit: 3, q: "title" });
      const second = await repo.list({ limit: 3, q: "title", cursor: first.nextCursor });
      expect([...ids(first.videos), ...ids(second.videos)]).toEqual(ids(many).slice(0, 6));
      expect(first.total).toBe(11);
    });

    it("has no next cursor when the last page is exactly full", async () => {
      const { repo } = await create(many.slice(0, 4));
      const page = await repo.list({ limit: 4 });
      expect(page.videos).toHaveLength(4);
      expect(page.nextCursor).toBeNull();
    });

    it("neither repeats nor skips videos when newer ones are published between pages", async () => {
      const { repo, add } = await create(many);
      const first = await repo.list({ limit: 4 });
      await add([video("new1", "2026-11-17T01:00:00.000Z"), video("new2", "2026-11-17T02:00:00.000Z")]);
      const second = await repo.list({ limit: 4, cursor: first.nextCursor });
      expect(ids(second.videos)).toEqual(ids(many.slice(4, 8)));
    });

    it("rejects cursors this API did not issue, and cursors from a different sort", async () => {
      const { repo } = await create(many);
      for (const bad of ["not base64 !!", btoa("abc"), btoa("123~short"), btoa("l~x~AAAAAAAAAAA"), btoa("l~1~2~AAAAAAAAAAA"), btoa("z~1~AAAAAAAAAAA"), btoa("b~notanumber~1~AAAAAAAAAAA")]) {
        await expect(repo.list({ limit: 4, cursor: bad }), bad).rejects.toBeInstanceOf(InvalidCursorError);
      }
      const latestCursor = (await repo.list({ limit: 4 })).nextCursor!;
      await expect(repo.list({ limit: 4, sort: "oldest", cursor: latestCursor })).rejects.toBeInstanceOf(InvalidCursorError);
    });

    it("treats an empty cursor as no cursor", async () => {
      const { repo } = await create(many);
      expect(ids((await repo.list({ limit: 2, cursor: "" })).videos)).toEqual(ids(many.slice(0, 2)));
    });

    it("round-trips a cursor", () => {
      const v = video("rt", "2026-11-16T08:00:00+00:00");
      expect(decodeCursor(encodeCursor(v), "latest")).toEqual({ sort: "latest", publishedMs: Date.parse("2026-11-16T08:00:00Z"), youtubeId: testId("rt") });
    });
  });

  describe(`${name}: single reads`, () => {
    it("describes the catalog", async () => {
      const { repo } = await create(SAMPLE);
      expect(await repo.meta()).toMatchObject({ mode: expect.stringMatching(/^(seed|feed|api)$/), total: 4, newestPublishedAt: "2026-11-16T09:00:00.000Z", newestId: testId("a") });
      expect((await create([])).repo).toBeDefined();
      expect(await (await create([])).repo.meta()).toMatchObject({ newestPublishedAt: null, newestId: null });
    });

    it("changes its version when videos are added", async () => {
      const { repo, add } = await create(SAMPLE);
      const before = (await repo.meta()).version;
      await add([video("fresh", "2026-11-17T00:00:00.000Z")]);
      expect((await repo.meta()).version).not.toBe(before);
    });

    it("gets a video by id or null", async () => {
      const { repo } = await create(SAMPLE);
      expect((await repo.get(testId("c")))?.youtubeId).toBe(testId("c"));
      expect(await repo.get("missing____")).toBeNull();
    });

    it("lists related videos exactly as the selector does over the sorted catalog, never including the video itself", async () => {
      const { repo } = await create(SAMPLE);
      const related = await repo.related(SAMPLE[1]!, 10);
      expect(ids(related)).toEqual(ids(relatedVideos(SAMPLE[1]!, [...SAMPLE].sort(compareVideos), 10)));
      expect(ids(related)).not.toContain(testId("b"));
      expect(related.length).toBeGreaterThan(0);
      expect(related).toHaveLength(Math.min(related.length, 2));
      expect(await repo.related(SAMPLE[1]!, 1)).toHaveLength(1);
    });

    it("ranks a same-team video from the same game window above one from another week", async () => {
      const day = 86_400_000;
      const base = Date.parse("2026-11-16T12:00:00Z");
      const at = (ms: number) => new Date(base + ms).toISOString();
      const current = video("current", at(0), { type: "GAME_HIGHLIGHTS", teams: ["LAL", "BOS"] });
      const sameGame = video("samegame", at(-0.5 * day), { type: "MEDIA_AVAILABILITY", teams: ["LAL"] });
      const lastWeek = video("lastweek", at(-7 * day), { type: "MEDIA_AVAILABILITY", teams: ["LAL"] });
      const { repo } = await create([current, sameGame, lastWeek]);
      expect(ids(await repo.related(current, 10))).toEqual([testId("samegame"), testId("lastweek")]);
    });

    it("counts videos per team, summarises channels by their newest title, and lists all ids", async () => {
      const { repo } = await create(SAMPLE);
      expect(Object.fromEntries(await repo.countsByTeam())).toEqual({ LAL: 3, BOS: 2 });
      const channels = await repo.channels();
      expect(channels).toHaveLength(2);
      expect(channels.find((c) => c.channelTitle === "Celtics")?.count).toBe(1);
      expect(await repo.allIds()).toEqual(ids(SAMPLE));
    });
  });

  describe(`${name}: best first and id lookup`, () => {
    const D = 86_400_000;
    const base = Date.parse("2026-11-16T12:00:00Z");
    const ago = (days: number) => new Date(base - days * D).toISOString();
    // Different kinds and ages, so the order differs from newest-first: a 2-day-old recap outranks a fresh media availability.
    const mixed = [
      video("recap2d", ago(2), { type: "GAME_HIGHLIGHTS" }),
      video("media0d", ago(0.1), { type: "MEDIA_AVAILABILITY" }),
      video("post1d", ago(1), { type: "POSTGAME_INTERVIEW" }),
      video("player5d", ago(5), { type: "PLAYER_HIGHLIGHTS" }),
      video("top3d", ago(3), { type: "TOP_PLAYS" }),
      video("pre1d", ago(1.5), { type: "PREGAME_INTERVIEW" }),
      video("recap9d", ago(9), { type: "GAME_HIGHLIGHTS" }),
    ];

    it("orders exactly as the published Best first formula, at any time of day", async () => {
      const { repo } = await create(mixed);
      const order = ids((await repo.list({ limit: 20, sort: "best" })).videos);
      for (const now of [base, base + 3 * D, base + 40 * D]) expect(order).toEqual(ids(sortBestFirst(mixed, now)));
      expect(order).not.toEqual(ids((await repo.list({ limit: 20 })).videos));
    });

    it("pages best first with a stable cursor, visiting every video once", async () => {
      const { repo } = await create(mixed);
      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await repo.list({ limit: 3, sort: "best", cursor });
        expect(page.total).toBe(mixed.length);
        seen.push(...ids(page.videos));
        cursor = page.nextCursor;
      } while (cursor);
      expect(seen).toEqual(ids(sortBestFirst(mixed, base)));
    });

    it("does not accept a latest cursor for best first, or the other way round", async () => {
      const { repo } = await create(mixed);
      const latest = (await repo.list({ limit: 2 })).nextCursor!;
      const best = (await repo.list({ limit: 2, sort: "best" })).nextCursor!;
      await expect(repo.list({ limit: 2, sort: "best", cursor: latest })).rejects.toBeInstanceOf(InvalidCursorError);
      await expect(repo.list({ limit: 2, cursor: best })).rejects.toBeInstanceOf(InvalidCursorError);
    });

    it("filters best first like any other order", async () => {
      const { repo } = await create(mixed);
      const page = await repo.list({ limit: 10, sort: "best", contentTypes: ["GAME_HIGHLIGHTS", "TOP_PLAYS"] });
      expect(ids(page.videos)).toEqual(ids(sortBestFirst(mixed.filter((v) => ["GAME_HIGHLIGHTS", "TOP_PLAYS"].includes(v.labels.contentType)), base)));
    });

    it("returns only the requested ids, in catalog order, and ignores ones that do not exist", async () => {
      const { repo } = await create(mixed);
      const page = await repo.list({ limit: 10, ids: [testId("player5d"), testId("recap2d"), "doesnotexist"] });
      expect(ids(page.videos)).toEqual([testId("recap2d"), testId("player5d")]);
      expect(page.total).toBe(2);
      expect(await repo.count({ ids: [testId("top3d")] })).toBe(1);
    });
  });
}
