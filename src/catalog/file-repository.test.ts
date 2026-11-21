import { describe, expect, it } from "vitest";
import { FileCatalogRepository } from "./file-repository";
import { describeRepositoryContract, video } from "./repository-contract";
import type { Catalog, Video } from "./schema";

describeRepositoryContract("file repository", async (initial: Video[]) => {
  let generation = 0;
  let catalog: Catalog = { schemaVersion: 1, mode: "feed", generatedAt: "2026-11-16T10:00:00.000Z", videos: initial };
  // Like the real loader, hand back the same object until the data changes.
  const repo = new FileCatalogRepository(() => catalog);
  return {
    repo,
    async add(videos: Video[]) {
      generation += 1;
      catalog = { ...catalog, generatedAt: `2026-11-16T10:00:0${generation}.000Z`, videos: [...catalog.videos, ...videos] };
    },
  };
});

describe("file repository specifics", () => {
  it("version follows the catalog's generation time", async () => {
    const repo = new FileCatalogRepository(() => ({ schemaVersion: 1, mode: "feed", generatedAt: "2026-11-16T10:00:00.000Z", videos: [video("a", "2026-11-16T09:00:00.000Z")] }));
    expect((await repo.meta()).version).toBe("2026-11-16T10:00:00.000Z");
  });

  it("does not modify the catalog it was given", async () => {
    const videos = [video("a", "2026-11-15T09:00:00.000Z"), video("b", "2026-11-16T09:00:00.000Z")];
    const copy = videos.map((v) => v.youtubeId);
    await new FileCatalogRepository(() => ({ schemaVersion: 1, mode: "feed", generatedAt: "x", videos })).list({ limit: 5, sort: "oldest" });
    expect(videos.map((v) => v.youtubeId)).toEqual(copy);
  });
});
