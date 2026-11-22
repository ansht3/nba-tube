import { describe, expect, it } from "vitest";
import type { Video } from "@/catalog/schema";
import { makeVideo, testId } from "@/test/fixtures";
import { bestFirstScore, bestKey, effectivePublishedMs, sortBestFirst } from "./rank";

const NOW = Date.parse("2026-11-12T12:00:00Z");
const HOUR = 3_600_000;

function video(name: string, contentType: Video["labels"]["contentType"], hoursAgo: number, publisherType: "league" | "team" = "team"): Video {
  const base = makeVideo();
  return makeVideo({
    youtubeId: testId(name),
    publishedAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
    labels: { ...base.labels, contentType },
    provenance: { ...base.provenance, publisherType },
  });
}

describe("best first", () => {
  it("puts a game recap ahead of a fresher practice availability", () => {
    const recap = video("recap", "GAME_HIGHLIGHTS", 30);
    const practice = video("practice", "MEDIA_AVAILABILITY", 2);
    expect(sortBestFirst([practice, recap], NOW)).toEqual([recap, practice]);
  });

  it("lets a recent video outrank a much older one of a better kind", () => {
    const oldRecap = video("oldRecap", "GAME_HIGHLIGHTS", 24 * 7);
    const newPresser = video("presser", "POSTGAME_INTERVIEW", 3);
    expect(sortBestFirst([oldRecap, newPresser], NOW)).toEqual([newPresser, oldRecap]);
  });

  it("gives the league channel's recap a small edge over a team's recap of the same age", () => {
    const team = video("team", "GAME_HIGHLIGHTS", 5);
    const league = video("league", "GAME_HIGHLIGHTS", 5, "league");
    expect(sortBestFirst([team, league], NOW)).toEqual([league, team]);
  });

  it("is deterministic: ties break by date, then id, whatever the input order", () => {
    const a = video("a", "PREGAME_INTERVIEW", 10);
    const b = video("b", "PREGAME_INTERVIEW", 10);
    expect(sortBestFirst([b, a], NOW)).toEqual(sortBestFirst([a, b], NOW));
  });

  it("ranks a date later than the check as if published when it was checked, so it cannot outrank real news", () => {
    const checkedAt = "2026-11-10T12:00:00.000Z";
    const base = video("premiere", "GAME_HIGHLIGHTS", 0);
    const premiere = { ...base, publishedAt: "2026-11-20T00:00:00.000Z", provenance: { ...base.provenance, metadataCheckedAt: checkedAt } };
    const real = { ...base, youtubeId: "realvideo01", publishedAt: "2026-11-11T00:00:00.000Z", provenance: { ...base.provenance, metadataCheckedAt: "2026-11-11T01:00:00.000Z" } };
    expect(effectivePublishedMs(premiere)).toBe(Date.parse(checkedAt));
    expect(bestKey(real)).toBeGreaterThan(bestKey(premiere));
    // A normal video is untouched: checked after it was published.
    expect(effectivePublishedMs(real)).toBe(Date.parse(real.publishedAt));
  });

  it("does not reward a date in the future", () => {
    const future = video("future", "GAME_HIGHLIGHTS", -48);
    const checkedNow = { ...future, provenance: { ...future.provenance, metadataCheckedAt: new Date(NOW).toISOString() } };
    expect(bestFirstScore(checkedNow, NOW)).toBe(3);
  });
});
