import { describe, expect, it } from "vitest";
import { makeVideo, testId } from "@/test/fixtures";
import type { Catalog } from "./schema";
import { buildStatus, fallbackFor, syncStatusSchema } from "./status";

const catalog: Catalog = {
  schemaVersion: 1,
  mode: "feed",
  generatedAt: "2026-11-16T10:00:00.000Z",
  videos: [
    makeVideo({ youtubeId: testId("a"), publishedAt: "2026-11-15T10:00:00.000Z" }),
    makeVideo({ youtubeId: testId("b"), publishedAt: "2026-11-16T09:00:00.000Z" }),
  ],
};

describe("buildStatus", () => {
  it("reports the newest published video regardless of order", () => {
    expect(buildStatus(catalog, null)).toEqual({ generatedAt: catalog.generatedAt, mode: "feed", videoCount: 2, newestPublishedAt: "2026-11-16T09:00:00.000Z", sync: null });
  });

  it("has no newest video for an empty catalog", () => {
    expect(buildStatus({ ...catalog, videos: [] }, null).newestPublishedAt).toBeNull();
  });
});

describe("fallbackFor", () => {
  it("keeps the previous catalog when there is one and uses the seed only for a first build", () => {
    expect(fallbackFor(catalog)).toBe("previous-catalog");
    expect(fallbackFor(null)).toBe("seed");
  });
});

describe("syncStatusSchema", () => {
  it("accepts a failure record and rejects an unknown fallback", () => {
    const failed = { ok: false, finishedAt: "2026-11-16T10:00:00.000Z", mode: null, usedFallback: "previous-catalog", sourceErrors: 0, error: "HTTP 500" };
    expect(syncStatusSchema.safeParse(failed).success).toBe(true);
    expect(syncStatusSchema.safeParse({ ...failed, usedFallback: "nothing" }).success).toBe(false);
  });
});
