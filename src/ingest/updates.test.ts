import { describe, expect, it } from "vitest";
import { makeCandidate, makeSource, testId } from "@/test/fixtures";
import { parseOverrides } from "./overrides";
import { pendingCandidates, refreshStatus } from "./updates";

const NOW = new Date("2026-11-16T12:00:00Z");
const source = makeSource();
const overrides = parseOverrides({ schemaVersion: 1, include: [], exclude: [] });
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();
const base = { sources: [source], overrides, now: NOW, retentionDays: 45 };
const candidate = (name: string, minutesAgo: number, title = "Player Name Game Highlights | November 15, 2026") =>
  makeCandidate({ youtubeId: testId(name), channelId: source.channelId, title, publishedAt: ago(minutesAgo) });

describe("pendingCandidates", () => {
  it("returns accepted videos the site does not have", () => {
    const fresh = candidate("fresh", 30);
    expect(pendingCandidates({ ...base, published: new Set(), feeds: [fresh] })).toEqual([fresh]);
  });

  it("ignores videos that are already published", () => {
    const known = candidate("known", 30);
    expect(pendingCandidates({ ...base, published: new Set([known.youtubeId]), feeds: [known] })).toEqual([]);
  });

  it("ignores videos older than the retention window and videos the rules reject", () => {
    const old = candidate("old", 46 * 24 * 60);
    const rejected = candidate("rejected", 30, "Behind the scenes with the mascot");
    expect(pendingCandidates({ ...base, published: new Set(), feeds: [old, rejected] })).toEqual([]);
  });
});

describe("refreshStatus", () => {
  it("is current when nothing is waiting", () => {
    expect(refreshStatus([], NOW)).toEqual({ status: "current", oldestPendingMinutes: null });
  });

  it("is pending while a video is newer than the normal rebuild time", () => {
    expect(refreshStatus([candidate("a", 20)], NOW)).toEqual({ status: "pending", oldestPendingMinutes: 20 });
  });

  it("is stuck once any video has waited longer than an hour, judged by the oldest", () => {
    expect(refreshStatus([candidate("a", 20), candidate("b", 180)], NOW)).toEqual({ status: "stuck", oldestPendingMinutes: 180 });
  });

  it("treats exactly the limit as still pending", () => {
    expect(refreshStatus([candidate("a", 60)], NOW).status).toBe("pending");
  });
});
