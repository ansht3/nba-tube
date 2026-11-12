import { describe, expect, it } from "vitest";
import { makeVideo, testId } from "@/test/fixtures";
import { withinStorageLimit } from "./load";
import type { Catalog } from "./schema";

const NOW = new Date("2026-12-20T00:00:00Z");

function catalog(mode: Catalog["mode"]): Catalog {
  const checked = (iso: string, name: string) => makeVideo({ youtubeId: testId(name), provenance: { ...makeVideo().provenance, metadataCheckedAt: iso } });
  return { schemaVersion: 1, mode, generatedAt: "2026-11-11T00:00:00Z", videos: [checked("2026-12-01T00:00:00Z", "fresh"), checked("2026-11-11T00:00:00Z", "stale")] };
}

describe("withinStorageLimit", () => {
  it("removes API records checked more than 30 days ago", () => {
    expect(withinStorageLimit(catalog("api"), NOW).videos.map((video) => video.youtubeId)).toEqual([testId("fresh")]);
  });

  it("leaves feed and seed catalogs alone", () => {
    expect(withinStorageLimit(catalog("feed"), NOW).videos).toHaveLength(2);
    expect(withinStorageLimit(catalog("seed"), NOW).videos).toHaveLength(2);
  });
});
