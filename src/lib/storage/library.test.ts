import { describe, expect, it } from "vitest";
import { MAX_HISTORY, isSaved, parseSavedList, recordWatch, removeSaved, toSavedVideo, toggleSaved, type SavedVideo } from "./library";

function saved(id: string, savedAt = 1): SavedVideo {
  return { id: id.padEnd(11, "_"), title: `Title ${id}`, channelTitle: "NBA", savedAt };
}

describe("parseSavedList", () => {
  it("keeps valid entries in order", () => {
    const list = [saved("a"), saved("b")];
    expect(parseSavedList(list)).toEqual(list);
  });

  it("returns an empty list for anything that is not an array", () => {
    for (const stored of [null, undefined, "liked", 42, { id: "x" }]) expect(parseSavedList(stored)).toEqual([]);
  });

  it("drops entries with a bad id or missing fields", () => {
    const stored = [
      saved("good"),
      { ...saved("x"), id: "<script>" },
      { ...saved("y"), title: 42 },
      { ...saved("z"), savedAt: "yesterday" },
      { ...saved("big"), savedAt: 1e300 },
      { id: saved("w").id },
      null,
      "string",
    ];
    expect(parseSavedList(stored)).toEqual([saved("good")]);
  });

  it("drops repeats, keeping the first", () => {
    expect(parseSavedList([saved("a", 1), saved("b"), saved("a", 2)])).toEqual([saved("a", 1), saved("b")]);
  });

  it("does not keep properties it does not know", () => {
    const [entry] = parseSavedList([{ ...saved("a"), onclick: "alert(1)" }]);
    expect(Object.keys(entry).sort()).toEqual(["channelTitle", "id", "savedAt", "title"]);
  });

  it("respects the limit", () => {
    const many = Array.from({ length: 12 }, (_, index) => saved(`v${index}`));
    expect(parseSavedList(many, 5)).toHaveLength(5);
  });
});

describe("saved lists", () => {
  it("copies the id, title and channel of a video", () => {
    const video = { youtubeId: "_7TMNmEtbBk", title: "NBA's Nightly Recap", channelTitle: "NBA", durationSeconds: 300 };
    expect(toSavedVideo(video, 123)).toEqual({ id: "_7TMNmEtbBk", title: "NBA's Nightly Recap", channelTitle: "NBA", savedAt: 123 });
  });

  it("toggling adds to the front, and toggling again removes", () => {
    const list = toggleSaved([saved("a")], saved("b"));
    expect(list.map((entry) => entry.id)).toEqual([saved("b").id, saved("a").id]);
    expect(toggleSaved(list, saved("b"))).toEqual([saved("a")]);
  });

  it("never holds the same video twice", () => {
    let list: SavedVideo[] = [];
    list = toggleSaved(list, saved("a"));
    list = toggleSaved(list, saved("a"));
    list = toggleSaved(list, saved("a"));
    expect(list).toHaveLength(1);
  });

  it("removes one entry and leaves the rest", () => {
    expect(removeSaved([saved("a"), saved("b")], saved("a").id)).toEqual([saved("b")]);
    expect(removeSaved([saved("a")], "missing____")).toEqual([saved("a")]);
  });

  it("answers whether a video is in a list", () => {
    expect(isSaved([saved("a")], saved("a").id)).toBe(true);
    expect(isSaved([saved("a")], saved("b").id)).toBe(false);
  });
});

describe("recordWatch", () => {
  it("moves a rewatched video to the front instead of listing it twice", () => {
    const history = recordWatch([saved("a", 1), saved("b", 1)], saved("b", 2));
    expect(history).toEqual([saved("b", 2), saved("a", 1)]);
  });

  it("forgets the oldest entries beyond the cap", () => {
    let history: SavedVideo[] = [];
    for (let index = 0; index < MAX_HISTORY + 20; index++) history = recordWatch(history, saved(`v${index}`));
    expect(history).toHaveLength(MAX_HISTORY);
    expect(history[0]).toEqual(saved(`v${MAX_HISTORY + 19}`));
  });
});
