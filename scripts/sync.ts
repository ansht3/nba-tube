/**
 * Rebuilds the catalog from the verified channels.
 *
 *   npm run sync            Data API when YOUTUBE_API_KEY is set, Atom feeds otherwise
 *   npm run sync -- --mode=feed
 *   npm run seed            small keyless snapshot, written to data/seed/catalog.json
 *   npm run sync -- --dry-run
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { catalogSchema, type Catalog } from "@/catalog/schema";
import { approvedSources, parseSourceRegistry } from "@/catalog/sources";
import { resolveMode } from "@/ingest/mode";
import { parseOverrides } from "@/ingest/overrides";
import { runSync, type SyncReport, type SyncResult } from "@/ingest/sync";
import { createYouTubeApi, YouTubeApiError } from "@/ingest/youtube/api";
import { fetchChannelFeed } from "@/ingest/youtube/feed";
import { checkEmbed } from "@/ingest/youtube/oembed";

const DATA_DIR = path.join(process.cwd(), "data");
const CATALOG_PATH = path.join(DATA_DIR, "catalog.json");
const SEED_PATH = path.join(DATA_DIR, "seed", "catalog.json");
const REPORT_PATH = path.join(DATA_DIR, "sync-report.json");

/** A seed is a small sample, so it takes only the newest few videos of each channel. */
const SEED_VIDEOS_PER_CHANNEL = 8;

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function writeJson(file: string, value: unknown) {
  mkdirSync(path.dirname(file), { recursive: true });
  // Write to a temporary file first so an interrupted run never leaves half a catalog behind.
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
}

function readPreviousCatalog(): Catalog | null {
  if (!existsSync(CATALOG_PATH)) return null;
  const parsed = catalogSchema.safeParse(readJson(CATALOG_PATH));
  if (!parsed.success) {
    console.warn("The existing data/catalog.json is not valid and will be rebuilt from scratch.");
    return null;
  }
  return parsed.data;
}

function printReport(report: SyncReport, target: string, dryRun: boolean) {
  console.log(`\nMode: ${report.mode}`);
  console.log(`Discovered ${report.discovered} videos across the approved channels.`);
  console.log(`Catalog: ${report.total} videos (${report.added} added, ${report.removed} removed).`);

  const reasons = Object.entries(report.rejectedByReason).sort((a, b) => b[1] - a[1]);
  if (reasons.length > 0) {
    console.log("Rejected:");
    for (const [reason, count] of reasons) console.log(`  ${String(count).padStart(4)}  ${reason}`);
  }
  for (const error of report.sourceErrors) console.warn(`Skipped ${error.name}: ${error.message}`);
  if (report.mode === "api") console.log(`Quota units used: ${report.quotaUnitsUsed}`);
  if (report.stoppedEarly) console.warn(`Stopped early: ${report.stoppedEarly}`);
  console.log(dryRun ? "Dry run: nothing was written." : `Wrote ${path.relative(process.cwd(), target)}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: "string" },
      seed: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
    },
  });

  // Loads YOUTUBE_API_KEY from a local .env file when there is one.
  if (existsSync(".env")) process.loadEnvFile(".env");
  const apiKey = process.env.YOUTUBE_API_KEY?.trim();

  const mode = resolveMode({ requested: values.mode, seed: values.seed, apiKey });
  if (mode === "feed" && !values.seed && values.mode === undefined) {
    console.log("YOUTUBE_API_KEY is not set: using the keyless channel feeds (15 newest uploads per channel, no durations).");
  }

  const sources = approvedSources(parseSourceRegistry(readJson(path.join(DATA_DIR, "sources.json"))));
  const overrides = parseOverrides(readJson(path.join(DATA_DIR, "overrides.json")));
  const common = { sources, overrides, now: new Date() };

  let result: SyncResult;
  if (mode === "api") {
    const api = createYouTubeApi({ apiKey: apiKey!, fetch });
    result = await runSync({ ...common, mode: "api", api, previous: readPreviousCatalog() });
  } else {
    result = await runSync({
      ...common,
      mode: "feed",
      fetchFeed: (source) => fetchChannelFeed(source, fetch),
      checkEmbed: (youtubeId) => checkEmbed(youtubeId, fetch),
      // A seed always starts clean so that it only contains what was verified in this run.
      previous: values.seed ? null : readPreviousCatalog(),
      catalogMode: values.seed ? "seed" : "feed",
      limits: values.seed ? { perSourceLimit: SEED_VIDEOS_PER_CHANNEL } : undefined,
    });
  }

  const target = values.seed ? SEED_PATH : CATALOG_PATH;
  if (!values["dry-run"]) {
    writeJson(target, result.catalog);
    writeJson(REPORT_PATH, result.report);
  }
  printReport(result.report, target, values["dry-run"]);
}

main().catch((error: unknown) => {
  // Error messages from the API client never contain the key or a request URL.
  const message = error instanceof YouTubeApiError || error instanceof Error ? error.message : String(error);
  console.error(`Sync failed: ${message}`);
  process.exitCode = 1;
});
