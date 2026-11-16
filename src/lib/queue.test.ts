import { describe, expect, it } from "vitest";
import { buildQueue, playAllHref, watchHref, type QueueEntry } from "./queue";
import type { SavedVideo } from "./storage/library";
import type { Playlist } from "./storage/playlists";

const id = (n: number) => `video${String(n).padStart(6, "0")}`;
const saved = (n: number): SavedVideo => ({ id: id(n), title: `Title ${n}`, channelTitle: "NBA", savedAt: n });
const entry = (n: number): QueueEntry => ({ id: id(n), title: `Title ${n}`, channelTitle: "NBA" });
const playlist = (...ns: number[]): Playlist => ({ id: "p1", name: "Best plays", createdAt: 0, items: ns.map(saved) });
const base = { related: [entry(10), entry(11), entry(12)], history: [] as SavedVideo[] };

describe("buildQueue in a playlist", () => {
  it("uses the playlist's own order: previous and next are its neighbours", () => {
    const q = buildQueue({ ...base, currentId: id(2), playlist: playlist(1, 2, 3) });
    expect(q).toMatchObject({ source: "playlist", index: 1, listId: "p1", listName: "Best plays" });
    expect(q.previous?.id).toBe(id(1));
    expect(q.next?.id).toBe(id(3));
    expect(q.entries.map((e) => e.id)).toEqual([id(1), id(2), id(3)]);
  });

  it("has nothing before the first video and nothing after the last: the ends are real ends", () => {
    const list = playlist(1, 2, 3);
    expect(buildQueue({ ...base, currentId: id(1), playlist: list }).previous).toBeNull();
    expect(buildQueue({ ...base, currentId: id(3), playlist: list }).next).toBeNull();
  });

  it("plays a one-video playlist with no neighbours", () => {
    const q = buildQueue({ ...base, currentId: id(1), playlist: playlist(1) });
    expect(q).toMatchObject({ source: "playlist", previous: null, next: null });
  });

  it("falls back to suggestions when the current video is not in that playlist", () => {
    const q = buildQueue({ ...base, currentId: id(99), playlist: playlist(1, 2) });
    expect(q.source).toBe("related");
    expect(q.listId).toBeNull();
  });
});

describe("buildQueue without a playlist", () => {
  it("offers the first suggestion as next, and never the current video", () => {
    const q = buildQueue({ ...base, related: [entry(5), entry(10), entry(11)], currentId: id(5), playlist: null });
    expect(q.next?.id).toBe(id(10));
    expect(q.entries.map((e) => e.id)).toEqual([id(10), id(11)]);
  });

  it("offers the last video the viewer watched as previous, skipping the current one", () => {
    const history = [saved(5), saved(4), saved(3)];
    expect(buildQueue({ ...base, currentId: id(5), playlist: null, history }).previous?.id).toBe(id(4));
    expect(buildQueue({ ...base, currentId: id(9), playlist: null, history }).previous?.id).toBe(id(5));
  });

  it("has no previous when nothing was watched (history empty or paused), and no next when there are no suggestions", () => {
    const q = buildQueue({ currentId: id(1), playlist: null, related: [], history: [] });
    expect(q).toMatchObject({ previous: null, next: null, index: -1, entries: [] });
  });
});

describe("addresses", () => {
  it("carries the playlist in the address so the queue survives opening the next video", () => {
    expect(watchHref(id(1))).toBe(`/watch/${id(1)}/`);
    expect(watchHref(id(1), "p 1")).toBe(`/watch/${id(1)}/?list=p%201`);
    expect(watchHref(id(1), null)).toBe(`/watch/${id(1)}/`);
  });

  it("Play all opens the first video inside the playlist, or nothing for an empty one", () => {
    expect(playAllHref(playlist(7, 8))).toBe(`/watch/${id(7)}/?list=p1`);
    expect(playAllHref(playlist())).toBeNull();
  });
});
