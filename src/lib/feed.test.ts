import { describe, expect, it } from "vitest";
import { makeVideo, testId } from "@/test/fixtures";
import { NO_FILTERS } from "./browse";
import { FEED_CACHE_MAX_ENTRIES, FEED_CACHE_TTL_MS, FeedCache, feedKey, feedParams, feedReducer, initialFeed, parseFeedPage, wantsMore, type FeedPage } from "./feed";

const v = (name: string) => makeVideo({ youtubeId: testId(name) });
const page = (names: string[], total: number, nextCursor: string | null): FeedPage => ({ videos: names.map(v), total, nextCursor });
const ids = (videos: { youtubeId: string }[]) => videos.map((x) => x.youtubeId);

describe("feedParams and feedKey", () => {
  it("maps browse filters to API parameters and leaves defaults out", () => {
    expect(feedParams(NO_FILTERS).toString()).toBe("");
    const params = feedParams({ ...NO_FILTERS, query: "jokic", section: "highlights", type: "GAME_HIGHLIGHTS", team: "LAL", source: "UCWJ2lWNubArHWmf3FIHbfcQ", duration: "short", date: "week", sort: "best" });
    expect(Object.fromEntries(params)).toEqual({ q: "jokic", section: "highlights", type: "GAME_HIGHLIGHTS", team: "LAL", channel: "UCWJ2lWNubArHWmf3FIHbfcQ", duration: "short", date: "week", sort: "best" });
  });

  it("gives the same key for the same list however its parameters were ordered", () => {
    expect(feedKey("/browse", new URLSearchParams("team=LAL&sort=best"))).toBe(feedKey("/browse", new URLSearchParams("sort=best&team=LAL")));
    expect(feedKey("/browse", new URLSearchParams("team=LAL"))).not.toBe(feedKey("/browse", new URLSearchParams("team=BOS")));
    expect(feedKey("/browse", new URLSearchParams())).not.toBe(feedKey("/highlights", new URLSearchParams()));
  });
});

describe("feedReducer", () => {
  it("starts from a server-rendered first page, or from nothing", () => {
    const seeded = initialFeed("k", page(["a", "b"], 5, "cur"));
    expect(seeded).toMatchObject({ total: 5, nextCursor: "cur", status: "idle", done: false });
    expect(initialFeed("k")).toMatchObject({ videos: [], total: null, done: false });
    expect(initialFeed("k", page(["a"], 1, null)).done).toBe(true);
  });

  it("appends the next page in order and finishes when there is no cursor", () => {
    let state = initialFeed("k", page(["a", "b"], 5, "c1"));
    state = feedReducer(state, { type: "request" });
    expect(state.status).toBe("loading");
    state = feedReducer(state, { type: "loaded", key: "k", page: page(["c", "d"], 5, "c2") });
    state = feedReducer(state, { type: "loaded", key: "k", page: page(["e"], 5, null) });
    expect(ids(state.videos)).toEqual(["a", "b", "c", "d", "e"].map(testId));
    expect(state).toMatchObject({ status: "idle", done: true, nextCursor: null });
  });

  it("never repeats a video, even if a page overlaps what is already shown", () => {
    let state = initialFeed("k", page(["a", "b"], 4, "c1"));
    state = feedReducer(state, { type: "loaded", key: "k", page: page(["b", "c", "a", "d"], 4, null) });
    expect(ids(state.videos)).toEqual(["a", "b", "c", "d"].map(testId));
  });

  it("drops a response that belongs to a list the viewer has since left", () => {
    let state = initialFeed("old", page(["a"], 10, "c1"));
    state = feedReducer(state, { type: "request" });
    state = feedReducer(state, { type: "reset", key: "new", page: page(["x"], 3, null) });
    const after = feedReducer(state, { type: "loaded", key: "old", page: page(["b", "c"], 10, "c2") });
    expect(after).toBe(state);
    expect(feedReducer(state, { type: "failed", key: "old" })).toBe(state);
  });

  it("records a failure for the current list and stops wanting more until the viewer asks", () => {
    let state = initialFeed("k", page(["a"], 10, "c1"));
    expect(wantsMore(state)).toBe(true);
    state = feedReducer(state, { type: "request" });
    expect(wantsMore(state)).toBe(false);
    state = feedReducer(state, { type: "failed", key: "k" });
    expect(state.status).toBe("error");
    expect(wantsMore(state)).toBe(false);
  });

  it("does not ask for more before the first page, or after the last", () => {
    expect(wantsMore(initialFeed("k"))).toBe(false);
    expect(wantsMore(initialFeed("k", page(["a"], 1, null)))).toBe(false);
  });

  it("ignores a second request while one is in flight", () => {
    const loading = feedReducer(initialFeed("k", page(["a"], 9, "c")), { type: "request" });
    expect(feedReducer(loading, { type: "request" })).toBe(loading);
  });
});

describe("FeedCache", () => {
  const saved = { videos: [v("a")], total: 1, nextCursor: null, scrollY: 640 };

  it("returns what was saved, including where the viewer had scrolled to", () => {
    const cache = new FeedCache();
    cache.save("k", saved, 1000);
    expect(cache.restore("k", 2000)).toMatchObject({ scrollY: 640, total: 1 });
    expect(cache.restore("other", 2000)).toBeNull();
  });

  it("forgets a list after the time limit", () => {
    const cache = new FeedCache();
    cache.save("k", saved, 0);
    expect(cache.restore("k", FEED_CACHE_TTL_MS)).not.toBeNull();
    expect(cache.restore("k", FEED_CACHE_TTL_MS + 1)).toBeNull();
    expect(cache.restore("k", 0)).toBeNull();
  });

  it("keeps only the most recent lists", () => {
    const cache = new FeedCache();
    for (let i = 0; i < FEED_CACHE_MAX_ENTRIES + 3; i++) cache.save(`k${i}`, saved, i);
    expect(cache.restore("k0", 100)).toBeNull();
    expect(cache.restore(`k${FEED_CACHE_MAX_ENTRIES + 2}`, 100)).not.toBeNull();
  });

  it("a newer save of the same list replaces the old and counts as recent", () => {
    const cache = new FeedCache();
    cache.save("k0", { ...saved, scrollY: 1 }, 1);
    for (let i = 1; i < FEED_CACHE_MAX_ENTRIES; i++) cache.save(`k${i}`, saved, 2);
    cache.save("k0", { ...saved, scrollY: 99 }, 3);
    cache.save("extra", saved, 4);
    expect(cache.restore("k0", 5)?.scrollY).toBe(99);
    expect(cache.restore("k1", 5)).toBeNull();
  });
});

describe("parseFeedPage", () => {
  const good = { videos: [v("a"), v("b")], total: 9, nextCursor: "abc" };

  it("accepts what the API sends, including the last page (no cursor) and an empty list", () => {
    expect(parseFeedPage(good)).toEqual(good);
    expect(parseFeedPage({ ...good, nextCursor: null })?.nextCursor).toBeNull();
    expect(parseFeedPage({ videos: [], total: 0, nextCursor: null })).toEqual({ videos: [], total: 0, nextCursor: null });
  });

  it("refuses anything that is not a page, so it cannot throw inside the reducer", () => {
    for (const bad of [null, undefined, 7, "x", [], {}, { error: "bad gateway" }, { ...good, videos: undefined }, { ...good, videos: "no" }, { ...good, total: "9" }, { ...good, total: -1 }, { ...good, total: Infinity }, { ...good, nextCursor: 5 }, { ...good, nextCursor: undefined }, { ...good, videos: [null] }, { ...good, videos: [{ youtubeId: 1 }] }, { ...good, videos: [{ youtubeId: "x" }] }]) {
      expect(parseFeedPage(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});
