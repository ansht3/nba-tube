import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { FileCatalogRepository } from "@/catalog/file-repository";
import type { CatalogRepository } from "@/catalog/repository";
import { video } from "@/catalog/repository-contract";
import type { Catalog, Video } from "@/catalog/schema";
import { publishVideos } from "@/db/catalog-store";
import { migrate } from "@/db/migrate";
import { createPgliteDb } from "@/db/pglite";
import { PostgresCatalogRepository } from "@/db/postgres-repository";
import { testId } from "@/test/fixtures";
import { handleUpdates, handleVersion, type UpdatesBody } from "./catalog";

// v00 is the newest, then one every 30 minutes going back.
const at = (i: number) => new Date(Date.parse("2026-11-16T23:30:00Z") - i * 30 * 60_000).toISOString();
const make = (count: number, offset = 0) => Array.from({ length: count }, (_, i) => video(`v${String(i + offset).padStart(2, "0")}`, at(i + offset), { teams: i % 2 ? ["BOS"] : ["LAL"] }));
const fileRepo = (videos: Video[], generatedAt = "2026-11-16T10:00:00.000Z") => {
  const catalog: Catalog = { schemaVersion: 1, mode: "feed", generatedAt, videos };
  return new FileCatalogRepository(() => catalog);
};
const updates = async (repo: CatalogRepository, search: string, headers: Record<string, string> = {}) => handleUpdates(new Request(`https://nbatube.test/api/updates${search}`, { headers }), repo);
const body = async (r: Response) => (await r.json()) as UpdatesBody;

describe("GET /api/version", () => {
  it("is tiny, cacheable, and names the version, newest video and total", async () => {
    const response = await handleVersion(new Request("https://nbatube.test/api/version"), fileRepo(make(5)));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ version: "2026-11-16T10:00:00.000Z", newestId: testId("v00"), newestPublishedAt: at(0), total: 5 });
    expect(response.headers.get("cache-control")).toContain("s-maxage=15");
    expect(JSON.stringify(await (await handleVersion(new Request("https://nbatube.test/api/version"), fileRepo(make(5)))).json()).length).toBeLessThan(200);
  });

  it("answers 304 when the client already has this version", async () => {
    const repo = fileRepo(make(5));
    const etag = (await handleVersion(new Request("https://nbatube.test/api/version"), repo)).headers.get("etag")!;
    const again = await handleVersion(new Request("https://nbatube.test/api/version", { headers: { "if-none-match": etag } }), repo);
    expect(again.status).toBe(304);
    expect(await again.text()).toBe("");
  });

  it("is a generic 503 when the catalog cannot be read", async () => {
    const broken = fileRepo(make(1));
    vi.spyOn(broken, "meta").mockRejectedValue(new Error("secret connection string"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleVersion(new Request("https://nbatube.test/api/version"), broken);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});

describe("GET /api/updates", () => {
  const repo = fileRepo(make(40));

  it("returns exactly the videos newer than the one the client has, newest first", async () => {
    const result = await body(await updates(repo, `?since=${testId("v03")}`));
    expect(result).toMatchObject({ count: 3, hasMore: false, reset: false });
    expect(result.videos.map((v) => v.youtubeId)).toEqual([testId("v00"), testId("v01"), testId("v02")]);
  });

  it("returns nothing when the client is up to date", async () => {
    expect(await body(await updates(repo, `?since=${testId("v00")}`))).toMatchObject({ videos: [], count: 0, hasMore: false, reset: false });
  });

  it("treats exactly a page worth of new videos as complete, and more than that as hasMore", async () => {
    expect(await body(await updates(repo, `?since=${testId("v05")}&limit=5`))).toMatchObject({ count: 5, hasMore: false });
    const more = await body(await updates(repo, `?since=${testId("v06")}&limit=5`));
    expect(more).toMatchObject({ count: 5, hasMore: true });
    expect(more.videos).toHaveLength(5);
  });

  it("asks for a reload instead of inventing a count when the marker is not in the filtered list", async () => {
    // v04 is a LAL video. In the BOS feed (three videos) it is not there, so there is no telling what is "newer" than it.
    const result = await body(await updates(repo, `?since=${testId("v04")}&team=BOS`));
    expect(result).toMatchObject({ reset: true, count: 0, hasMore: false });
    expect(result.videos).toEqual([]);
  });

  it("still says hasMore when the marker is not found in a full page of new videos", async () => {
    const result = await body(await updates(repo, `?since=${testId("v05")}&limit=2`));
    expect(result).toMatchObject({ reset: false, hasMore: true, count: 2 });
  });

  it("applies the client's filters, using the newest video in the filtered feed as the marker", async () => {
    // BOS videos are the odd-numbered ones: v01, v03, v05, ...
    const result = await body(await updates(repo, `?since=${testId("v05")}&team=BOS`));
    expect(result.videos.map((v) => v.youtubeId)).toEqual([testId("v01"), testId("v03")]);
  });

  it("tells the client to reload when the video it has is no longer in the catalog", async () => {
    expect(await body(await updates(repo, "?since=gone_______"))).toMatchObject({ reset: true, videos: [], count: 0 });
  });

  it("rejects a missing or malformed marker, and parameters that do not apply", async () => {
    for (const search of ["", "?since=short", `?since=${testId("v03")}&cursor=abc`, `?since=${testId("v03")}&sort=oldest`, `?since=${testId("v03")}&bogus=1`, `?since=${testId("v03")}&limit=500`]) {
      expect((await updates(repo, search)).status, search).toBe(400);
    }
  });

  it("answers 304 for a client that already has this answer, and a new answer once the catalog changes", async () => {
    const first = await updates(fileRepo(make(10)), `?since=${testId("v03")}`);
    const etag = first.headers.get("etag")!;
    expect((await updates(fileRepo(make(10)), `?since=${testId("v03")}`, { "if-none-match": etag })).status).toBe(304);
    expect((await updates(fileRepo(make(10), "2026-11-16T10:05:00.000Z"), `?since=${testId("v03")}`, { "if-none-match": etag })).status).toBe(200);
  });
});

describe("updates over real Postgres", () => {
  let pg: PGlite;
  let repo: PostgresCatalogRepository;
  let db: ReturnType<typeof createPgliteDb>;
  beforeAll(async () => {
    pg = new PGlite();
    db = createPgliteDb(pg);
    await migrate(db);
    await publishVideos(db, make(20, 5), { mode: "feed" });
    repo = new PostgresCatalogRepository(db);
  });
  afterAll(async () => pg.close());

  it("sees videos ingestion publishes after the client loaded, and the version moves with them", async () => {
    const versionBefore = (await (await handleVersion(new Request("https://nbatube.test/api/version"), repo)).json()) as { version: string; newestId: string };
    expect(versionBefore.newestId).toBe(testId("v05"));

    await publishVideos(db, make(5, 0), { mode: "feed" });
    const versionAfter = (await (await handleVersion(new Request("https://nbatube.test/api/version"), repo)).json()) as { version: string; newestId: string };
    expect(versionAfter.version).not.toBe(versionBefore.version);
    expect(versionAfter.newestId).toBe(testId("v00"));

    const result = await body(await updates(repo, `?since=${versionBefore.newestId}`));
    expect(result.videos.map((v) => v.youtubeId)).toEqual([0, 1, 2, 3, 4].map((i) => testId(`v0${i}`)));
    expect(result).toMatchObject({ count: 5, hasMore: false, reset: false });
  });
});
