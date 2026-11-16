import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Catalog, Video } from "@/catalog/schema";
import { makeVideo, testId } from "@/test/fixtures";
import { importCatalog, pruneExpired, publishVideos } from "./catalog-store";
import type { Db } from "./db";
import { migrate } from "./migrate";
import { MIGRATIONS } from "./migrations";
import { createPgliteDb } from "./pglite";

let pg: PGlite;
let db: Db;

beforeAll(async () => {
  pg = new PGlite();
  db = createPgliteDb(pg);
  await migrate(db);
});
afterAll(async () => pg.close());
beforeEach(async () => {
  await pg.exec("TRUNCATE videos, channels, catalog_versions, ingestion_runs, source_checkpoints RESTART IDENTITY CASCADE");
});

const video = (name: string, publishedAt: string, extra: Partial<Video> = {}): Video => makeVideo({ youtubeId: testId(name), publishedAt, ...extra });
const count = async (table: string) => Number((await db.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`))[0]!.n);

describe("migrate", () => {
  it("creates the schema once and is a no-op the second time", async () => {
    const fresh = new PGlite();
    const freshDb = createPgliteDb(fresh);
    expect(await migrate(freshDb)).toEqual(MIGRATIONS.map((m) => m.id));
    expect(await migrate(freshDb)).toEqual([]);
    await fresh.close();
  });

  it("survives two migrators starting at the same time", async () => {
    const fresh = new PGlite();
    const freshDb = createPgliteDb(fresh);
    await Promise.all([migrate(freshDb), migrate(freshDb)]);
    expect(Number((await freshDb.query<{ n: string }>(`SELECT count(*) AS n FROM schema_migrations`))[0]!.n)).toBe(MIGRATIONS.length);
    await fresh.close();
  });

  it("creates the tables and the indexes the feed queries depend on", async () => {
    const tables = (await db.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)).map((r) => r.tablename);
    expect(tables).toEqual(expect.arrayContaining(["videos", "channels", "ingestion_runs", "source_checkpoints", "catalog_versions", "leases"]));
    const indexes = (await db.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE tablename = 'videos'`)).map((r) => r.indexname);
    expect(indexes).toEqual(expect.arrayContaining(["videos_published_idx", "videos_type_idx", "videos_section_idx", "videos_channel_idx", "videos_teams_idx"]));
  });
});

describe("publishVideos", () => {
  it("inserts videos and channels and publishes version 1", async () => {
    const result = await publishVideos(db, [video("a", "2026-11-16T09:00:00Z"), video("b", "2026-11-16T08:00:00Z")], { mode: "feed" });
    expect(result).toEqual({ version: 1, published: true, inserted: 2, updated: 0, unchanged: 0, removed: 0 });
    expect(await count("videos")).toBe(2);
    expect(await count("channels")).toBe(1);
    const [version] = await db.query<{ video_count: number; mode: string }>(`SELECT video_count, mode FROM catalog_versions`);
    expect(version).toEqual({ video_count: 2, mode: "feed" });
  });

  it("is idempotent: replaying the same videos changes nothing and mints no new version", async () => {
    const videos = [video("a", "2026-11-16T09:00:00Z"), video("b", "2026-11-16T08:00:00Z")];
    await publishVideos(db, videos, { mode: "feed" });
    const again = await publishVideos(db, videos, { mode: "feed" });
    expect(again).toEqual({ version: 1, published: false, inserted: 0, updated: 0, unchanged: 2, removed: 0 });
    expect(await count("videos")).toBe(2);
    expect(await count("catalog_versions")).toBe(1);
  });

  it("updates a changed video, including its channel title, and publishes the next version", async () => {
    await publishVideos(db, [video("a", "2026-11-16T09:00:00Z")], { mode: "feed" });
    const result = await publishVideos(db, [video("a", "2026-11-16T09:00:00Z", { title: "New title", channelTitle: "NBA (renamed)" })], { mode: "feed" });
    expect(result).toMatchObject({ version: 2, published: true, inserted: 0, updated: 1 });
    const [row] = await db.query<{ data: Video }>(`SELECT data FROM videos`);
    expect(row!.data.title).toBe("New title");
    expect((await db.query<{ title: string }>(`SELECT title FROM channels`))[0]!.title).toBe("NBA (renamed)");
  });

  it("removes confirmed-gone videos in the same transaction as the writes and publishes a version for it", async () => {
    await publishVideos(db, [video("a", "2026-11-16T09:00:00Z"), video("b", "2026-11-16T08:00:00Z")], { mode: "feed" });
    const result = await publishVideos(db, [], { mode: "feed", remove: [testId("a"), "notinstore__"] });
    expect(result).toMatchObject({ version: 2, published: true, removed: 1 });
    expect((await db.query<{ youtube_id: string }>(`SELECT youtube_id FROM videos`)).map((r) => r.youtube_id)).toEqual([testId("b")]);
    expect((await db.query<{ video_count: number }>(`SELECT video_count FROM catalog_versions WHERE version = 2`))[0]!.video_count).toBe(1);
  });

  it("does nothing, and mints no version, when asked to remove ids that are not stored", async () => {
    await publishVideos(db, [video("a", "2026-11-16T09:00:00Z")], { mode: "feed" });
    expect(await publishVideos(db, [], { mode: "feed", remove: ["notinstore__"] })).toMatchObject({ published: false, removed: 0, version: 1 });
  });

  it("keeps one record when the same video appears twice in one call (the last wins)", async () => {
    const result = await publishVideos(db, [video("a", "2026-11-16T09:00:00Z", { title: "first" }), video("a", "2026-11-16T09:00:00Z", { title: "second" })], { mode: "feed" });
    expect(result.inserted).toBe(1);
    expect((await db.query<{ data: Video }>(`SELECT data FROM videos`))[0]!.data.title).toBe("second");
  });

  it("rejects an invalid record before writing anything", async () => {
    const bad = { ...video("a", "2026-11-16T09:00:00Z"), thumbnailUrl: "http://evil.example/x.jpg" };
    await expect(publishVideos(db, [video("b", "2026-11-16T08:00:00Z"), bad], { mode: "feed" })).rejects.toThrow();
    expect(await count("videos")).toBe(0);
    expect(await count("catalog_versions")).toBe(0);
  });

  it("publishes the version in the same transaction as the writes: a failure leaves neither", async () => {
    const failing: Db = { query: db.query, batch: (statements) => db.batch([...statements, { sql: "SELECT 1/0" }]) };
    await expect(publishVideos(failing, [video("a", "2026-11-16T09:00:00Z")], { mode: "feed" })).rejects.toThrow();
    expect(await count("videos")).toBe(0);
    expect(await count("channels")).toBe(0);
    expect(await count("catalog_versions")).toBe(0);
  });

  it("stores the filter columns and orders newest first with ties by id, whatever the timestamp format", async () => {
    await publishVideos(
      db,
      [
        video("old", "2026-11-16T08:00:00+00:00"),
        video("zz", "2026-11-16T08:00:01.000Z"),
        video("aa", "2026-11-16T08:00:01.000Z", { labels: { ...makeVideo().labels, contentType: "GAME_HIGHLIGHTS", teamIds: ["LAL", "BOS"] } }),
      ],
      { mode: "feed" },
    );
    const rows = await db.query<{ youtube_id: string }>(`SELECT youtube_id FROM videos ORDER BY published_at DESC, youtube_id`);
    expect(rows.map((r) => r.youtube_id)).toEqual([testId("aa"), testId("zz"), testId("old")]);
    const [aa] = await db.query<{ section: string; team_ids: string[]; content_type: string }>(`SELECT section, team_ids, content_type FROM videos WHERE youtube_id = $1`, [testId("aa")]);
    expect(aa).toEqual({ section: "highlights", team_ids: ["LAL", "BOS"], content_type: "GAME_HIGHLIGHTS" });
  });
});

describe("importCatalog", () => {
  const catalog = (videos: Video[]): Catalog => ({ schemaVersion: 1, mode: "feed", generatedAt: "2026-11-16T10:00:00.000Z", videos });

  it("loads a catalog and never deletes videos that are not in it", async () => {
    await publishVideos(db, [video("keep", "2026-11-10T09:00:00Z")], { mode: "feed" });
    await importCatalog(db, catalog([video("a", "2026-11-16T09:00:00Z")]));
    expect(await count("videos")).toBe(2);
  });

  it("rejects a catalog that does not match the schema without writing", async () => {
    await expect(importCatalog(db, { ...catalog([video("a", "2026-11-16T09:00:00Z")]), schemaVersion: 2 })).rejects.toThrow();
    expect(await count("videos")).toBe(0);
  });
});

describe("pruneExpired", () => {
  const NOW = new Date("2026-12-20T00:00:00Z");
  const limits = { retentionDays: 45, maxMetadataAgeDays: 30 };
  const api = (name: string, checkedAt: string) => video(name, "2026-12-10T00:00:00Z", { provenance: { ...makeVideo().provenance, discoveryMethod: "data-api", metadataCheckedAt: checkedAt } });

  it("drops videos past retention and stale API metadata, keeps everything else, and publishes the new count", async () => {
    await publishVideos(
      db,
      [
        video("fresh", "2026-12-15T00:00:00Z"),
        video("ancient", "2026-10-01T00:00:00Z"),
        api("apistale", "2026-11-01T00:00:00Z"),
        api("apifresh", "2026-12-15T00:00:00Z"),
        video("feedoldcheck", "2026-12-10T00:00:00Z", { provenance: { ...makeVideo().provenance, metadataCheckedAt: "2026-10-30T00:00:00Z" } }),
      ],
      { mode: "feed" },
    );
    const result = await pruneExpired(db, NOW, limits);
    expect(result).toEqual({ deleted: 2, version: 2 });
    const left = (await db.query<{ youtube_id: string }>(`SELECT youtube_id FROM videos ORDER BY youtube_id`)).map((r) => r.youtube_id);
    expect(left).toEqual([testId("apifresh"), testId("feedoldcheck"), testId("fresh")].sort());
    const [version] = await db.query<{ video_count: number; mode: string }>(`SELECT video_count, mode FROM catalog_versions WHERE version = 2`);
    expect(version).toEqual({ video_count: 3, mode: "feed" });
  });

  it("deletes nothing and publishes nothing when nothing expired", async () => {
    await publishVideos(db, [video("fresh", "2026-12-15T00:00:00Z")], { mode: "feed" });
    expect(await pruneExpired(db, NOW, limits)).toEqual({ deleted: 0, version: null });
    expect(await count("videos")).toBe(1);
    expect(await count("catalog_versions")).toBe(1);
  });
});
