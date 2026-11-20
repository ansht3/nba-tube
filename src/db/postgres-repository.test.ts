import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { describeRepositoryContract, video } from "@/catalog/repository-contract";
import type { Video } from "@/catalog/schema";
import { publishVideos } from "./catalog-store";
import type { Db } from "./db";
import { migrate } from "./migrate";
import { createPgliteDb } from "./pglite";
import { PostgresCatalogRepository } from "./postgres-repository";

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  pg = new PGlite();
  db = createPgliteDb(pg);
  await migrate(db);
});
afterAll(async () => pg.close());

// The same behavioural tests the in-memory repository passes, against real Postgres.
describeRepositoryContract("postgres repository", async (initial: Video[]) => {
  await pg.exec("TRUNCATE videos, channels, catalog_versions, ingestion_runs, source_checkpoints, leases RESTART IDENTITY CASCADE");
  if (initial.length > 0) await publishVideos(db, initial, { mode: "feed" });
  return {
    repo: new PostgresCatalogRepository(db),
    async add(videos: Video[]) {
      await publishVideos(db, videos, { mode: "feed" });
    },
  };
});

describe("postgres repository: a stored row that no longer parses", () => {
  it("is skipped and logged, and every other video is still served", async () => {
    await pg.exec("TRUNCATE videos, channels, catalog_versions, ingestion_runs, source_checkpoints, leases RESTART IDENTITY CASCADE");
    await publishVideos(db, [video("good1", "2026-11-10T10:00:00Z"), video("broken", "2026-11-10T09:00:00Z"), video("good2", "2026-11-10T08:00:00Z")], { mode: "feed" });
    // Damaged in place, as an old schema or a bad write might leave it.
    await db.query(`UPDATE videos SET data = jsonb_set(data, '{labels}', '"not an object"') WHERE youtube_id = $1`, [video("broken", "2026-11-10T09:00:00Z").youtubeId]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const repo = new PostgresCatalogRepository(db);
      const page = await repo.list({ limit: 10 });
      expect(page.videos.map((v) => v.youtubeId)).toEqual([video("good1", "2026-11-10T10:00:00Z").youtubeId, video("good2", "2026-11-10T08:00:00Z").youtubeId]);
      expect(await repo.get(video("broken", "2026-11-10T09:00:00Z").youtubeId)).toBeNull();
      expect(await repo.get(video("good1", "2026-11-10T10:00:00Z").youtubeId)).not.toBeNull();
      expect(log).toHaveBeenCalledWith(expect.stringContaining(video("broken", "2026-11-10T09:00:00Z").youtubeId));
    } finally {
      log.mockRestore();
    }
  });
});
