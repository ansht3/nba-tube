import { describe, expect, it } from "vitest";
import type { SavedVideo } from "./library";
import {
  MAX_PLAYLISTS,
  PLAYLIST_NAME_MAX,
  addToPlaylist,
  createPlaylist,
  deletePlaylist,
  newPlaylistId,
  parsePlaylists,
  removeFromPlaylist,
  renamePlaylist,
  validatePlaylistName,
  type Playlist,
} from "./playlists";

function saved(id: string): SavedVideo {
  return { id: id.padEnd(11, "_"), title: `Title ${id}`, channelTitle: "NBA", savedAt: 1 };
}

function playlist(id: string, name: string, items: SavedVideo[] = []): Playlist {
  return { id, name, createdAt: 1, items };
}

describe("validatePlaylistName", () => {
  const existing = [playlist("1", "Finals rewatch")];

  it("accepts a new name", () => {
    expect(validatePlaylistName("Coach pressers", existing)).toBeNull();
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(validatePlaylistName("", existing)).toMatch(/name/);
    expect(validatePlaylistName("   ", existing)).toMatch(/name/);
  });

  it("rejects a name that is too long", () => {
    expect(validatePlaylistName("x".repeat(PLAYLIST_NAME_MAX + 1), existing)).toMatch(/under/);
    expect(validatePlaylistName("x".repeat(PLAYLIST_NAME_MAX), existing)).toBeNull();
  });

  it("rejects a duplicate name whatever its case or spacing", () => {
    expect(validatePlaylistName("  finals REWATCH ", existing)).toMatch(/already/);
  });

  it("lets a playlist keep its own name when renamed", () => {
    expect(validatePlaylistName("Finals rewatch", existing, "1")).toBeNull();
  });

  it("stops at the maximum number of playlists", () => {
    const full = Array.from({ length: MAX_PLAYLISTS }, (_, index) => playlist(String(index), `List ${index}`));
    expect(validatePlaylistName("One more", full)).toMatch(/up to/);
    expect(validatePlaylistName("Renamed", full, "3")).toBeNull();
  });
});

describe("playlist operations", () => {
  it("creates a playlist at the front with a trimmed name", () => {
    const playlists = createPlaylist([playlist("1", "Old")], "  New  ", "2", 99);
    expect(playlists[0]).toEqual({ id: "2", name: "New", createdAt: 99, items: [] });
    expect(playlists).toHaveLength(2);
  });

  it("does not create a playlist with an invalid name", () => {
    const existing = [playlist("1", "Old")];
    expect(createPlaylist(existing, "", "2", 99)).toBe(existing);
    expect(createPlaylist(existing, "old", "2", 99)).toBe(existing);
  });

  it("renames only the chosen playlist", () => {
    const playlists = renamePlaylist([playlist("1", "A"), playlist("2", "B")], "2", "C");
    expect(playlists.map((entry) => entry.name)).toEqual(["A", "C"]);
  });

  it("refuses a rename to an invalid or taken name", () => {
    const existing = [playlist("1", "A"), playlist("2", "B")];
    expect(renamePlaylist(existing, "2", "a")).toBe(existing);
    expect(renamePlaylist(existing, "2", " ")).toBe(existing);
  });

  it("deletes a playlist", () => {
    expect(deletePlaylist([playlist("1", "A"), playlist("2", "B")], "1")).toEqual([playlist("2", "B")]);
  });

  it("adds a video once, at the end", () => {
    let playlists = [playlist("1", "A", [saved("a")])];
    playlists = addToPlaylist(playlists, "1", saved("b"));
    playlists = addToPlaylist(playlists, "1", saved("b"));
    expect(playlists[0].items).toEqual([saved("a"), saved("b")]);
  });

  it("leaves other playlists alone when adding or removing", () => {
    const playlists = [playlist("1", "A", [saved("a")]), playlist("2", "B", [saved("a")])];
    expect(addToPlaylist(playlists, "1", saved("b"))[1]).toBe(playlists[1]);
    const removed = removeFromPlaylist(playlists, "1", saved("a").id);
    expect(removed[0].items).toEqual([]);
    expect(removed[1].items).toEqual([saved("a")]);
  });

  it("ignores an unknown playlist id", () => {
    const playlists = [playlist("1", "A")];
    expect(addToPlaylist(playlists, "missing", saved("a"))).toEqual(playlists);
    expect(removeFromPlaylist(playlists, "missing", saved("a").id)).toEqual(playlists);
  });

  it("generates distinct ids", () => {
    expect(newPlaylistId()).not.toBe(newPlaylistId());
  });
});

describe("parsePlaylists", () => {
  it("keeps valid playlists and validates their items", () => {
    const stored = [{ id: "1", name: "A", createdAt: 5, items: [saved("a"), { id: "bad" }] }];
    expect(parsePlaylists(stored)).toEqual([playlist("1", "A", [saved("a")])].map((entry) => ({ ...entry, createdAt: 5 })));
  });

  it("drops playlists without an id or a name, and repeated ids", () => {
    const stored = [
      { id: "1", name: "A", createdAt: 1, items: [] },
      { id: "", name: "No id", items: [] },
      { id: "2", name: "   ", items: [] },
      { id: "1", name: "Repeat", items: [] },
      null,
      "playlist",
    ];
    expect(parsePlaylists(stored).map((entry) => entry.name)).toEqual(["A"]);
  });

  it("repairs a missing item list and creation time", () => {
    expect(parsePlaylists([{ id: "1", name: "A" }])).toEqual([{ id: "1", name: "A", createdAt: 0, items: [] }]);
  });

  it("returns an empty list for anything that is not an array", () => {
    for (const stored of [null, "x", 1, {}]) expect(parsePlaylists(stored)).toEqual([]);
  });
});
