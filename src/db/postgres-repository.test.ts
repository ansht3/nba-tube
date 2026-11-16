import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll } from "vitest";
import { describeRepositoryContract } from "@/catalog/repository-contract";
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
