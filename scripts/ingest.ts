/**
 * Runs one ingestion pass from your machine, with the same code the Worker runs.
 *
 *   npm run ingest -- --local            in-memory Postgres (PGlite), real YouTube feeds: nothing is stored
 *   npm run ingest -- --local --twice    run twice; the second should change nothing
 *   npm run ingest                       against DATABASE_URL (Neon)
 *
 * YOUTUBE_API_KEY, when set, enables durations and recovery of missed uploads.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { approvedSources, parseSourceRegistry } from "@/catalog/sources";
import type { Db } from "@/db/db";
import { migrate } from "@/db/migrate";
import { createNeonDb } from "@/db/neon";
import { parseOverrides } from "@/ingest/overrides";
import { runIngestion } from "@/ingest/run";
import { createYouTubeApi } from "@/ingest/youtube/api";

const readJson = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));

async function database(local: boolean): Promise<Db> {
  if (local) {
    const [{ PGlite }, { createPgliteDb }] = await Promise.all([import("@electric-sql/pglite"), import("@/db/pglite")]);
    return createPgliteDb(new PGlite());
  }
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set. Use --local for an in-memory run, or see docs/DATABASE.md.");
  return createNeonDb(url);
}

async function main() {
  const { values } = parseArgs({ options: { local: { type: "boolean", default: false }, twice: { type: "boolean", default: false } } });
  if (existsSync(".env")) process.loadEnvFile(".env");
  const db = await database(values.local);
  await migrate(db);

  const sources = approvedSources(parseSourceRegistry(readJson("data/sources.json")));
  const overrides = parseOverrides(readJson("data/overrides.json"));
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();
  const api = apiKey ? createYouTubeApi({ apiKey, fetch }) : undefined;

  for (let pass = 1; pass <= (values.twice ? 2 : 1); pass++) {
    const started = Date.now();
    const summary = await runIngestion({ db, sources, overrides, fetch, api, owner: `local-${pass}-${randomUUID()}` });
    if (summary.status === "failed") process.exitCode = 1;
    console.log(`Pass ${pass} (${((Date.now() - started) / 1000).toFixed(1)}s): ${JSON.stringify({ ...summary, failedChannels: summary.failedChannels.map((c) => c.name) })}`);
  }
  const [{ n, newest }] = await db.query<{ n: string; newest: string | null }>(`SELECT count(*) AS n, max(published_at) AS newest FROM videos`);
  console.log(`Database now holds ${n} videos; newest published ${newest}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
