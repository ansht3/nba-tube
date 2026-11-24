import { describe, expect, it, vi } from "vitest";
import { BACKUP_VERSION, MAX_BACKUP_BYTES, createBackup, mergeLibrary, mergeSaved, parseBackup, readBackupFile, type Library } from "./backup";
import type { SavedVideo } from "./library";
import type { Playlist } from "./playlists";

const id = (n: number) => `video${String(n).padStart(6, "0")}`;
const saved = (n: number, savedAt = n): SavedVideo => ({ id: id(n), title: `Title ${n}`, channelTitle: "NBA", savedAt });
const playlist = (pid: string, name: string, ...ns: number[]): Playlist => ({ id: pid, name, createdAt: 1, items: ns.map((n) => saved(n)) });
const library = (over: Partial<Library> = {}): Library => ({ liked: [], watchLater: [], history: [], playlists: [], ...over });
const NOW = new Date("2026-11-16T12:00:00Z");

describe("createBackup and parseBackup", () => {
  const mine = library({ liked: [saved(1), saved(2)], watchLater: [saved(3)], history: [saved(4)], playlists: [playlist("p1", "Best", 1, 2)] });

  it("round-trips likes, watch later and playlists, and leaves history out unless asked", () => {
    const text = JSON.stringify(createBackup(mine, { includeHistory: false, now: NOW }));
    const result = parseBackup(text);
    expect(result).toMatchObject({ ok: true, dropped: 0 });
    if (!result.ok) return;
    expect(result.library.liked).toEqual(mine.liked);
    expect(result.library.playlists).toEqual(mine.playlists);
    expect(result.library.history).toBeUndefined();
  });

  it("includes history only when the viewer chose to", () => {
    const result = parseBackup(JSON.stringify(createBackup(mine, { includeHistory: true, now: NOW })));
    expect(result.ok && result.library.history).toEqual(mine.history);
  });

  it("names the app and version so another file is not mistaken for a backup", () => {
    expect(createBackup(mine, { includeHistory: false, now: NOW })).toMatchObject({ app: "nbatube", version: BACKUP_VERSION, exportedAt: "2026-11-16T12:00:00.000Z" });
  });

  it("rejects text that is not JSON, not ours, newer than we understand, or empty, with a reason", () => {
    expect(parseBackup("{nope")).toMatchObject({ ok: false, error: expect.stringContaining("not valid JSON") });
    expect(parseBackup('{"app":"other","version":1,"liked":[]}')).toMatchObject({ ok: false, error: expect.stringContaining("not an NBATube backup") });
    expect(parseBackup("[]")).toMatchObject({ ok: false });
    expect(parseBackup(`{"app":"nbatube","version":${BACKUP_VERSION + 1},"liked":[]}`)).toMatchObject({ ok: false, error: expect.stringContaining("newer version") });
    expect(parseBackup('{"app":"nbatube","version":0,"liked":[]}')).toMatchObject({ ok: false });
    expect(parseBackup('{"app":"nbatube","version":1}')).toMatchObject({ ok: false, error: expect.stringContaining("no lists") });
    expect(parseBackup("x".repeat(MAX_BACKUP_BYTES + 1))).toMatchObject({ ok: false, error: expect.stringContaining("too large") });
  });

  it("drops invalid entries instead of trusting them, and says how many", () => {
    const text = JSON.stringify({
      app: "nbatube",
      version: 1,
      liked: [saved(1), { id: "short", title: "x", channelTitle: "y", savedAt: 1 }, saved(1), "junk", null],
      playlists: [{ ...playlist("p1", "Mixed", 1), items: [saved(1), { id: 5 }] }, { id: "", name: "No id", items: [] }],
    });
    const result = parseBackup(text);
    expect(result.ok && result.library.liked).toEqual([saved(1)]);
    expect(result).toMatchObject({ ok: true, dropped: 4 + 1 + 1 });
  });
});

describe("mergeSaved", () => {
  it("is the union, one entry per video, the more recent save wins, newest first, capped", () => {
    const merged = mergeSaved([saved(1, 10), saved(2, 20)], [saved(1, 50), saved(3, 5)], 10);
    expect(merged.map((e) => [e.id, e.savedAt])).toEqual([[id(1), 50], [id(2), 20], [id(3), 5]]);
    expect(mergeSaved([saved(1, 1), saved(2, 2), saved(3, 3)], [], 2).map((e) => e.id)).toEqual([id(3), id(2)]);
  });
});

describe("mergeLibrary", () => {
  it("adds what the file has and keeps everything already here, and counts what was new", () => {
    const here = library({ liked: [saved(1)], playlists: [playlist("p1", "Mine", 1)] });
    const { library: merged, added } = mergeLibrary(here, { liked: [saved(1), saved(2)], watchLater: [saved(3)], playlists: [playlist("p2", "Theirs", 4, 5)] });
    expect(merged.liked.map((e) => e.id).sort()).toEqual([id(1), id(2)]);
    expect(merged.watchLater).toHaveLength(1);
    expect(merged.playlists.map((p) => p.name)).toEqual(["Mine", "Theirs"]);
    expect(added).toEqual({ liked: 1, watchLater: 1, history: 0, playlists: 1, playlistVideos: 2 });
  });

  it("gives a playlist with the same id the videos it lacks, keeping its own name and order", () => {
    const { library: merged, added } = mergeLibrary(library({ playlists: [playlist("p1", "Mine", 1, 2)] }), { playlists: [playlist("p1", "Renamed elsewhere", 2, 3, 4)] });
    expect(merged.playlists).toHaveLength(1);
    expect(merged.playlists[0]).toMatchObject({ name: "Mine" });
    expect(merged.playlists[0]!.items.map((e) => e.id)).toEqual([id(1), id(2), id(3), id(4)]);
    expect(added).toMatchObject({ playlists: 0, playlistVideos: 2 });
  });

  it("renames an incoming playlist whose name another playlist already uses, so names stay unique", () => {
    const { library: merged } = mergeLibrary(library({ playlists: [playlist("p1", "Favourites", 1)] }), { playlists: [playlist("p9", "favourites", 2), playlist("p10", "FAVOURITES", 3)] });
    expect(merged.playlists.map((p) => p.name)).toEqual(["Favourites", "favourites (imported)", "FAVOURITES (imported 2)"]);
  });

  it("does not change the library it was given", () => {
    const here = library({ liked: [saved(1)], playlists: [playlist("p1", "Mine", 1)] });
    const before = JSON.stringify(here);
    mergeLibrary(here, { liked: [saved(2)], playlists: [playlist("p1", "Mine", 1, 2)] });
    expect(JSON.stringify(here)).toBe(before);
  });

  it("merging the same backup twice changes nothing the second time", () => {
    const incoming = { liked: [saved(2)], playlists: [playlist("p2", "Theirs", 4)] };
    const once = mergeLibrary(library({ liked: [saved(1)] }), incoming).library;
    const twice = mergeLibrary(once, incoming);
    expect(twice.library).toEqual(once);
    expect(twice.added).toEqual({ liked: 0, watchLater: 0, history: 0, playlists: 0, playlistVideos: 0 });
  });
});

describe("readBackupFile", () => {
  const backupText = JSON.stringify(createBackup({ liked: [], watchLater: [], history: [], playlists: [] }, { includeHistory: false, now: NOW }));

  it("refuses a file that is too large without ever reading it", async () => {
    const text = vi.fn(async () => "never read");
    const result = await readBackupFile({ size: MAX_BACKUP_BYTES + 1, text });
    expect(result).toEqual({ ok: false, error: "That file is too large to be an NBATube backup." });
    expect(text).not.toHaveBeenCalled();
  });

  it("reads and parses a file within the limit", async () => {
    const result = await readBackupFile({ size: backupText.length, text: async () => backupText });
    expect(result.ok).toBe(true);
  });

  it("answers a read that fails with a message, instead of an unhandled rejection", async () => {
    const result = await readBackupFile({ size: 10, text: async () => { throw new DOMException("not readable", "NotReadableError"); } });
    expect(result).toEqual({ ok: false, error: "That file could not be read." });
  });

  it("still refuses a file whose size was understated, once it is read", async () => {
    const result = await readBackupFile({ size: 10, text: async () => "x".repeat(MAX_BACKUP_BYTES + 1) });
    expect(result.ok).toBe(false);
  });
});
