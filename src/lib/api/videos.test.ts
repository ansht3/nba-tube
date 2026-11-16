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
import { etagMatches } from "./http";
import { handleGetVideo, handleListVideos } from "./videos";

const NOW = Date.parse("2026-11-16T12:00:30Z");
// v00 is the newest, then one every 30 minutes going back.
const many = Array.from({ length: 30 }, (_, i) => video(`v${String(i).padStart(2, "0")}`, new Date(Date.parse("2026-11-16T23:30:00Z") - i * 30 * 60_000).toISOString()));
const fileRepo = (videos: Video[], generatedAt = "2026-11-16T10:00:00.000Z") => {
  const catalog: Catalog = { schemaVersion: 1, mode: "feed", generatedAt, videos };
  return new FileCatalogRepository(() => catalog);
};
const get = (repo: CatalogRepository, search = "", headers: Record<string, string> = {}, now = NOW) =>
  handleListVideos(new Request(`https://nbatube.test/api/videos${search}`, { headers }), repo, now);

describe("GET /api/videos", () => {
  it("returns the newest 24 with a total, a cursor, the version, and public cache headers", async () => {
    const response = await get(fileRepo(many));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=30, stale-while-revalidate=300");
    expect(response.headers.get("etag")).toMatch(/^W\/"/);
    const body = await response.json();
    expect(body.videos).toHaveLength(24);
    expect(body).toMatchObject({ total: 30, version: "2026-11-16T10:00:00.000Z" });
    expect(body.nextCursor).toEqual(expect.any(String));
  });

  it("walks the whole catalog by following nextCursor, with no repeats or gaps", async () => {
    const repo = fileRepo(many);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const body: { videos: Video[]; nextCursor: string | null } = await (await get(repo, `?limit=7${cursor ? `&cursor=${cursor}` : ""}`)).json();
      seen.push(...body.videos.map((v) => v.youtubeId));
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(many.map((v) => v.youtubeId));
  });

  it("rejects bad parameters with a 400 that is never cached", async () => {
    for (const search of ["?limit=100", "?team=ZZZ", "?extra=1", "?cursor=garbage"]) {
      const response = await get(fileRepo(many), search);
      expect(response.status, search).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect((await response.json()).error).toEqual(expect.any(String));
    }
  });

  it("answers a repeat request with 304, and does not run the list query to do it", async () => {
    const repo = fileRepo(many);
    const first = await get(repo, "?section=highlights");
    const etag = first.headers.get("etag")!;
    const list = vi.spyOn(repo, "list");
    const second = await get(repo, "?section=highlights", { "if-none-match": etag });
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
    expect(list).not.toHaveBeenCalled();
  });

  it("gives the same ETag for the same query in a different parameter order, and a different one for a different query", async () => {
    const repo = fileRepo(many);
    const a = (await get(repo, "?team=LAL&section=highlights")).headers.get("etag");
    const b = (await get(repo, "?section=highlights&team=LAL")).headers.get("etag");
    const c = (await get(repo, "?team=BOS&section=highlights")).headers.get("etag");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("changes the ETag when the catalog version changes, so a cached copy stops matching", async () => {
    const before = (await get(fileRepo(many, "2026-11-16T10:00:00.000Z"))).headers.get("etag")!;
    const after = await get(fileRepo(many, "2026-11-16T10:05:00.000Z"), "", { "if-none-match": before });
    expect(after.status).toBe(200);
  });

  it("makes an upload-window answer expire with the minute even if the catalog did not change", async () => {
    const repo = fileRepo(many);
    const first = (await get(repo, "?date=day", {}, NOW)).headers.get("etag")!;
    expect((await get(repo, "?date=day", { "if-none-match": first }, NOW + 10_000)).status).toBe(304);
    expect((await get(repo, "?date=day", { "if-none-match": first }, NOW + 120_000)).status).toBe(200);
  });

  it("returns 503 without leaking the cause when the catalog cannot be read", async () => {
    const broken = fileRepo(many);
    vi.spyOn(broken, "meta").mockRejectedValue(new Error("connect ECONNREFUSED postgres://user:secret@host/db"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await get(broken);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(JSON.stringify(await response.json())).not.toMatch(/secret|postgres|ECONNREFUSED/);
  });
});

describe("GET /api/videos/:id", () => {
  const repo = fileRepo(many);
  const one = (id: string, headers: Record<string, string> = {}, r: CatalogRepository = repo) => handleGetVideo(new Request(`https://nbatube.test/api/videos/${id}`, { headers }), id, r);

  it("returns the video with cache headers and an ETag", async () => {
    const response = await one(testId("v00"));
    expect(response.status).toBe(200);
    expect((await response.json()).video.youtubeId).toBe(testId("v00"));
    expect(response.headers.get("cache-control")).toContain("s-maxage=300");
  });

  it("is 304 for a matching ETag, 404 for an unknown id and 400 for a malformed one", async () => {
    const etag = (await one(testId("v00"))).headers.get("etag")!;
    expect((await one(testId("v00"), { "if-none-match": etag })).status).toBe(304);
    const missing = await one("missing____");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect((await one("short")).status).toBe(400);
    expect((await one("../../etc/pw")).status).toBe(400);
  });
});

describe("etagMatches", () => {
  it("compares weakly, accepts a list and *, and rejects other tags", () => {
    expect(etagMatches('W/"a"', 'W/"a"')).toBe(true);
    expect(etagMatches('"a"', 'W/"a"')).toBe(true);
    expect(etagMatches('W/"x", W/"a"', 'W/"a"')).toBe(true);
    expect(etagMatches("*", 'W/"a"')).toBe(true);
    expect(etagMatches('W/"b"', 'W/"a"')).toBe(false);
    expect(etagMatches(null, 'W/"a"')).toBe(false);
  });
});

describe("the same API over real Postgres", () => {
  let pg: PGlite;
  let repo: PostgresCatalogRepository;
  beforeAll(async () => {
    pg = new PGlite();
    const db = createPgliteDb(pg);
    await migrate(db);
    await publishVideos(db, many, { mode: "feed" });
    repo = new PostgresCatalogRepository(db);
  });
  afterAll(async () => pg.close());

  it("pages through everything with filters, 304s on the catalog version, and returns the same videos as the file repository", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const body: { videos: Video[]; nextCursor: string | null; total: number } = await (await get(repo, `?limit=8&q=title${cursor ? `&cursor=${cursor}` : ""}`)).json();
      expect(body.total).toBe(30);
      seen.push(...body.videos.map((v) => v.youtubeId));
      cursor = body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(many.map((v) => v.youtubeId));

    const etag = (await get(repo)).headers.get("etag")!;
    expect((await get(repo, "", { "if-none-match": etag })).status).toBe(304);
    expect(await (await get(repo, "?limit=5")).json()).toMatchObject({ videos: (await (await get(fileRepo(many), "?limit=5")).json()).videos });
  });
});
