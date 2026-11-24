import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "./db";
import { acquireLease, releaseLease, renewLease } from "./lease";
import { migrate } from "./migrate";
import { createPgliteDb } from "./pglite";

let pg: PGlite;
let db: Db;
beforeAll(async () => {
  pg = new PGlite();
  db = createPgliteDb(pg);
  await migrate(db);
});
afterAll(async () => pg.close());
beforeEach(async () => pg.exec("TRUNCATE leases"));

describe("lease", () => {
  it("is held by one owner at a time", async () => {
    expect(await acquireLease(db, "ingestion", "run-a", 60)).toBe(true);
    expect(await acquireLease(db, "ingestion", "run-b", 60)).toBe(false);
  });

  it("lets exactly one of many simultaneous claimants win", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => acquireLease(db, "ingestion", `run-${i}`, 60)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("can be taken over once it has expired, and the old holder can no longer renew it", async () => {
    await acquireLease(db, "ingestion", "run-a", 60);
    await pg.exec(`UPDATE leases SET expires_at = now() - interval '1 second'`);
    expect(await renewLease(db, "ingestion", "run-a", 60)).toBe(false);
    expect(await acquireLease(db, "ingestion", "run-b", 60)).toBe(true);
    expect(await renewLease(db, "ingestion", "run-a", 60)).toBe(false);
    expect(await renewLease(db, "ingestion", "run-b", 60)).toBe(true);
  });

  it("is free again after release, and only its owner can release it", async () => {
    await acquireLease(db, "ingestion", "run-a", 60);
    await releaseLease(db, "ingestion", "run-b");
    expect(await acquireLease(db, "ingestion", "run-c", 60)).toBe(false);
    await releaseLease(db, "ingestion", "run-a");
    expect(await acquireLease(db, "ingestion", "run-c", 60)).toBe(true);
  });

  it("keeps different names independent", async () => {
    expect(await acquireLease(db, "ingestion", "run-a", 60)).toBe(true);
    expect(await acquireLease(db, "maintenance", "run-b", 60)).toBe(true);
  });
});
