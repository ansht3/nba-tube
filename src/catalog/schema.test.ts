import { describe, expect, it } from "vitest";
import { makeVideo } from "@/test/fixtures";
import { catalogSchema, videoSchema } from "./schema";

function videoWith(overrides: Record<string, unknown> = {}) {
  return { ...makeVideo(), ...overrides };
}

describe("videoSchema", () => {
  it("accepts a record with unknown duration and embeddability", () => {
    expect(videoSchema.parse(videoWith()).durationSeconds).toBeNull();
  });

  it("rejects a malformed video id", () => {
    expect(() => videoSchema.parse(videoWith({ youtubeId: "../../etc" }))).toThrow();
    expect(() => videoSchema.parse(videoWith({ youtubeId: "short" }))).toThrow();
  });

  it("only allows thumbnails served by YouTube over https", () => {
    const bad = [
      "https://evil.example/vi/x/hqdefault.jpg",
      "http://i.ytimg.com/vi/_7TMNmEtbBk/hqdefault.jpg",
      "javascript:alert(1)",
      "https://i.ytimg.com.evil.example/a.jpg",
    ];
    for (const thumbnailUrl of bad) {
      expect(() => videoSchema.parse(videoWith({ thumbnailUrl }))).toThrow();
    }
    expect(() => videoSchema.parse(videoWith({ thumbnailUrl: "https://i4.ytimg.com/vi/_7TMNmEtbBk/hqdefault.jpg" }))).not.toThrow();
  });

  it("rejects an invalid duration, date or team", () => {
    expect(() => videoSchema.parse(videoWith({ durationSeconds: 0 }))).toThrow();
    expect(() => videoSchema.parse(videoWith({ durationSeconds: 12.5 }))).toThrow();
    expect(() => videoSchema.parse(videoWith({ publishedAt: "yesterday" }))).toThrow();
    const labels = { ...makeVideo().labels, teamIds: ["SEA"] };
    expect(() => videoSchema.parse(videoWith({ labels }))).toThrow();
  });
});

describe("catalogSchema", () => {
  it("accepts an empty catalog", () => {
    const catalog = { schemaVersion: 1, mode: "seed", generatedAt: "2026-11-11T18:00:00.000Z", videos: [] };
    expect(catalogSchema.parse(catalog).videos).toEqual([]);
  });

  it("rejects an unknown schema version", () => {
    const catalog = { schemaVersion: 2, mode: "seed", generatedAt: "2026-11-11T18:00:00.000Z", videos: [] };
    expect(() => catalogSchema.parse(catalog)).toThrow();
  });
});
